#!/usr/bin/env node

/**
 * Homeboy Threads — Product Import Pipeline
 * Scrapes Poshmark and Depop listings, normalizes them,
 * and outputs a Shopify-compatible CSV for import.
 *
 * Usage: node scripts/import-listings.js
 * Output: output/shopify-import.csv
 */

const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');
const slugify = require('slugify');
const path = require('path');
const fs = require('fs');

// ─── CONFIG ───
const POSHMARK_CLOSET = 'https://poshmark.com/closet/homeboythreads';
const DEPOP_SHOP = 'https://www.depop.com/shophomeboythreads/';
const OUTPUT_PATH = path.join(__dirname, '..', 'output', 'shopify-import.csv');
const DELAY_MIN = 1000;
const DELAY_MAX = 2000;

// ─── HELPERS ───
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
}

function slugifyTitle(title) {
  return slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g }).slice(0, 200);
}

function detectBrand(title, description, metadata) {
  const brands = [
    'Reformation', 'Guess', 'Madewell', 'Levi\'s', 'Levis', 'Anthropologie',
    'Banana Republic', 'Free People', 'Zara', 'H&M', 'Nike', 'Adidas',
    'Urban Outfitters', 'J.Crew', 'Gap', 'Old Navy', 'Theory', 'Vince',
    'AllSaints', 'Sandro', 'Maje', 'Reiss', 'COS', 'Aritzia',
    'Patagonia', 'The North Face', 'Everlane', 'Eileen Fisher',
    'Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein', 'Michael Kors'
  ];

  // Check metadata first (most reliable)
  if (metadata && metadata.trim()) {
    for (const brand of brands) {
      if (metadata.toLowerCase().includes(brand.toLowerCase())) {
        return brand;
      }
    }
  }

  // Check title
  const combined = `${title} ${description}`.toLowerCase();
  for (const brand of brands) {
    if (combined.includes(brand.toLowerCase())) {
      return brand;
    }
  }

  return 'Designer Donated';
}

function detectCondition(title, description, conditionField) {
  const text = `${title} ${description} ${conditionField || ''}`.toLowerCase();
  if (text.includes('nwt') || text.includes('new with tags') || text.includes('brand new')) {
    return 'nwt';
  }
  if (text.includes('like new') || text.includes('excellent') || text.includes('grade a')) {
    return 'grade-a';
  }
  return 'grade-b';
}

function detectCollections(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const collections = [];

  if (/dress|midi|mini|maxi|gown/.test(text)) collections.push('dresses');
  if (/top|blouse|shirt|tee|crop|tank/.test(text)) collections.push('tops');
  if (/jeans|denim|trousers|pants|shorts/.test(text)) collections.push('denim');
  if (/jacket|coat|blazer|cardigan|hoodie|sweater/.test(text)) collections.push('outerwear');

  collections.push('designer-donated');

  if (collections.length === 1) collections.push('all');

  return collections;
}

function formatTitle(brand, title, condition) {
  // Remove brand from title if it's already there
  let cleaned = title;
  if (brand !== 'Designer Donated') {
    const brandRegex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleaned = cleaned.replace(brandRegex, '').trim();
  }

  // Remove platform jargon
  cleaned = cleaned
    .replace(/\bNWT\b/gi, '')
    .replace(/\bNWOT\b/gi, '')
    .replace(/\bEUC\b/gi, '')
    .replace(/\bGUC\b/gi, '')
    .replace(/\bVGUC\b/gi, '')
    .replace(/\bposhmark\b/gi, '')
    .replace(/\bdepop\b/gi, '')
    .replace(/\bfree ship(ping)?\b/gi, '')
    .replace(/\bbundle\b/gi, '')
    .replace(/\bfirm\b/gi, '')
    .replace(/\bprice drop\b/gi, '')
    .replace(/[!]{2,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Remove leading dashes/hyphens
  cleaned = cleaned.replace(/^[\s\-—–]+/, '').trim();

  // Capitalize properly
  cleaned = cleaned.replace(/\b\w/g, c => c.toUpperCase());

  // Remove duplicated words
  const words = cleaned.split(' ');
  const deduped = words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase());
  cleaned = deduped.join(' ');

  const conditionLabel = condition === 'nwt' ? 'NWT' : condition === 'grade-a' ? 'Grade A' : 'Grade B';

  return `${brand} — ${cleaned} — ${conditionLabel}`;
}

function generateBodyHtml(description, condition, brand, impactHours) {
  const conditionLabels = {
    'nwt': 'New With Tags — Never worn, original tags attached',
    'grade-a': 'Grade A — Like new, minimal or no signs of wear',
    'grade-b': 'Grade B — Good condition, minor signs of wear'
  };

  return `<div class="product-description">
<p>${description}</p>
<hr>
<p><strong>Condition:</strong> ${conditionLabels[condition] || condition}</p>
<p><strong>Sourced by:</strong> Donated by ${brand} to Homeboy Threads</p>
<p><strong>Impact:</strong> This purchase funds approximately ${impactHours} hours of job training and reentry programming through Homeboy Industries.</p>
<hr>
<p><em>Every Homeboy Threads purchase supports Homeboy Industries — the world's largest gang intervention and reentry program in Los Angeles.</em></p>
</div>`;
}

// ─── POSHMARK SCRAPER ───
async function scrapePoshmark(browser) {
  console.log('📦 Scraping Poshmark closet...');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  const listings = [];
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    const url = pageNum === 1 ? POSHMARK_CLOSET : `${POSHMARK_CLOSET}?page=${pageNum}`;
    console.log(`  Page ${pageNum}: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(1500);

      // Scroll to load lazy content
      await page.evaluate(async () => {
        for (let i = 0; i < 5; i++) {
          window.scrollBy(0, 800);
          await new Promise(r => setTimeout(r, 500));
        }
      });

      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-et-name="listing"], .card--small, .tile');
        const results = [];

        cards.forEach(card => {
          try {
            const titleEl = card.querySelector('.tile__title, .title__condition__container a, a[data-et-name="listing"]');
            const priceEl = card.querySelector('.p--t--1, [data-et-name="listing_price"]');
            const originalPriceEl = card.querySelector('.p--t--1 .fw--light, .original-price');
            const imgEl = card.querySelector('img');
            const linkEl = card.querySelector('a[href*="/listing/"]');
            const brandEl = card.querySelector('.tile__details__pipe__brand, .brand-name');

            if (titleEl) {
              results.push({
                title: titleEl.textContent.trim(),
                price: priceEl ? priceEl.textContent.replace(/[^0-9.]/g, '') : '0',
                originalPrice: originalPriceEl ? originalPriceEl.textContent.replace(/[^0-9.]/g, '') : '',
                image: imgEl ? (imgEl.src || imgEl.dataset.src || '') : '',
                url: linkEl ? linkEl.href : '',
                brand: brandEl ? brandEl.textContent.trim() : '',
                platform: 'poshmark'
              });
            }
          } catch (e) { /* skip bad card */ }
        });

        return results;
      });

      if (items.length === 0) {
        hasMore = false;
      } else {
        listings.push(...items);
        pageNum++;
        await randomDelay();
      }
    } catch (err) {
      console.log(`  ⚠ Error on page ${pageNum}: ${err.message}`);
      hasMore = false;
    }
  }

  // Scrape detail pages for extra data (descriptions, all images)
  for (let i = 0; i < listings.length; i++) {
    if (!listings[i].url) continue;
    try {
      console.log(`  Detail ${i + 1}/${listings.length}: ${listings[i].title.slice(0, 40)}...`);
      await page.goto(listings[i].url, { waitUntil: 'networkidle2', timeout: 20000 });
      await sleep(1000);

      const detail = await page.evaluate(() => {
        const descEl = document.querySelector('.listing__description, [data-test="listing_description"]');
        const sizeEl = document.querySelector('.listing__size, [data-test="listing_size"]');
        const conditionEl = document.querySelector('.listing__condition, [data-test="listing_condition"]');
        const images = Array.from(document.querySelectorAll('.listing__carousel img, .listing__image img, img[data-test="listing_image"]'));

        return {
          description: descEl ? descEl.textContent.trim() : '',
          size: sizeEl ? sizeEl.textContent.trim() : '',
          condition: conditionEl ? conditionEl.textContent.trim() : '',
          images: images.map(img => img.src || img.dataset.src).filter(Boolean)
        };
      });

      listings[i] = { ...listings[i], ...detail };
      await randomDelay();
    } catch (err) {
      console.log(`  ⚠ Skipping detail: ${err.message}`);
    }
  }

  await page.close();
  console.log(`  ✅ Found ${listings.length} Poshmark listings`);
  return listings;
}

// ─── DEPOP SCRAPER ───
async function scrapeDepop(browser) {
  console.log('📦 Scraping Depop shop...');
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 900 });

  const listings = [];

  try {
    await page.goto(DEPOP_SHOP, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Scroll to load all products
    let prevHeight = 0;
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === prevHeight) break;
      prevHeight = newHeight;
    }

    const items = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="product__item"], a[href*="/products/"]');
      const results = [];
      const seen = new Set();

      cards.forEach(card => {
        try {
          const link = card.tagName === 'A' ? card : card.querySelector('a');
          const imgEl = card.querySelector('img');
          const priceEl = card.querySelector('[data-testid="product__price"], p');

          const url = link ? link.href : '';
          if (seen.has(url) || !url.includes('/products/')) return;
          seen.add(url);

          results.push({
            title: imgEl ? (imgEl.alt || '') : '',
            price: priceEl ? priceEl.textContent.replace(/[^0-9.]/g, '') : '0',
            originalPrice: '',
            image: imgEl ? imgEl.src : '',
            url: url,
            brand: '',
            platform: 'depop'
          });
        } catch (e) { /* skip */ }
      });

      return results;
    });

    listings.push(...items);

    // Get detail pages
    for (let i = 0; i < listings.length; i++) {
      if (!listings[i].url) continue;
      try {
        console.log(`  Detail ${i + 1}/${listings.length}: ${listings[i].title.slice(0, 40)}...`);
        await page.goto(listings[i].url, { waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(1000);

        const detail = await page.evaluate(() => {
          const descEl = document.querySelector('[data-testid="product__description"], .ProductDescription');
          const sizeEl = document.querySelector('[data-testid="product__size"], .ProductSize');
          const brandEl = document.querySelector('[data-testid="product__brand"], .ProductBrand');
          const conditionEl = document.querySelector('[data-testid="product__condition"]');
          const priceEl = document.querySelector('[data-testid="product__price"]');
          const originalPriceEl = document.querySelector('[data-testid="product__originalPrice"]');
          const images = Array.from(document.querySelectorAll('[data-testid="product__image"] img, .ProductImage img'));

          return {
            description: descEl ? descEl.textContent.trim() : '',
            size: sizeEl ? sizeEl.textContent.trim() : '',
            brand: brandEl ? brandEl.textContent.trim() : '',
            condition: conditionEl ? conditionEl.textContent.trim() : '',
            price: priceEl ? priceEl.textContent.replace(/[^0-9.]/g, '') : '',
            originalPrice: originalPriceEl ? originalPriceEl.textContent.replace(/[^0-9.]/g, '') : '',
            images: images.map(img => img.src).filter(Boolean)
          };
        });

        listings[i] = { ...listings[i], ...detail };
        await randomDelay();
      } catch (err) {
        console.log(`  ⚠ Skipping detail: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`  ⚠ Error scraping Depop: ${err.message}`);
  }

  await page.close();
  console.log(`  ✅ Found ${listings.length} Depop listings`);
  return listings;
}

// ─── NORMALIZE ───
function normalizeListings(rawListings) {
  console.log('🔧 Normalizing listings...');

  // Track brands for "featured" tagging
  const brandPrices = {};

  const normalized = rawListings.map(listing => {
    const brand = detectBrand(listing.title, listing.description || '', listing.brand || '');
    const condition = detectCondition(listing.title, listing.description || '', listing.condition || '');
    const collections = detectCollections(listing.title, listing.description || '');

    if (condition === 'nwt') collections.push('new-with-tags');

    const price = parseFloat(listing.price) || 0;
    const originalPrice = parseFloat(listing.originalPrice) || 0;
    const impactHours = Math.round(price / 35);

    const title = formatTitle(brand, listing.title, condition);
    const handle = slugifyTitle(title);

    // Track for featured tagging
    if (!brandPrices[brand]) brandPrices[brand] = [];
    brandPrices[brand].push({ handle, price });

    const tags = [
      condition,
      `brand-${slugify(brand, { lower: true })}`,
      'women',
      ...collections
    ];

    const images = listing.images && listing.images.length > 0
      ? listing.images
      : (listing.image ? [listing.image] : []);

    return {
      handle,
      title,
      body: generateBodyHtml(listing.description || listing.title, condition, brand, impactHours),
      vendor: brand,
      type: 'Clothing',
      tags,
      published: true,
      option1Name: 'Size',
      option1Value: listing.size || 'One Size',
      variantPrice: price.toFixed(2),
      variantComparePrice: originalPrice > price ? originalPrice.toFixed(2) : '',
      images,
      impactHours,
      sourceUrl: listing.url,
      platform: listing.platform
    };
  });

  // Tag top 4 highest-priced items per brand as "featured"
  Object.keys(brandPrices).forEach(brand => {
    const sorted = brandPrices[brand].sort((a, b) => b.price - a.price);
    const top4 = sorted.slice(0, 4);
    top4.forEach(item => {
      const product = normalized.find(p => p.handle === item.handle);
      if (product) product.tags.push('featured');
    });
  });

  console.log(`  ✅ Normalized ${normalized.length} listings`);
  return normalized;
}

// ─── CSV OUTPUT ───
async function writeCsv(products) {
  console.log('📝 Writing CSV...');

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const rows = [];

  products.forEach(product => {
    const tags = product.tags.join(', ');
    const sku = `HBT-${product.handle.slice(0, 20).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;

    if (product.images.length === 0) {
      // Single row, no image
      rows.push({
        Handle: product.handle,
        Title: product.title,
        'Body (HTML)': product.body,
        Vendor: product.vendor,
        Type: product.type,
        Tags: tags,
        Published: product.published ? 'TRUE' : 'FALSE',
        'Option1 Name': product.option1Name,
        'Option1 Value': product.option1Value,
        'Variant SKU': sku,
        'Variant Price': product.variantPrice,
        'Variant Compare At Price': product.variantComparePrice,
        'Image Src': '',
        'Image Position': '',
        'Metafield: impact_hours [number_integer]': product.impactHours
      });
    } else {
      product.images.forEach((img, idx) => {
        rows.push({
          Handle: product.handle,
          Title: idx === 0 ? product.title : '',
          'Body (HTML)': idx === 0 ? product.body : '',
          Vendor: idx === 0 ? product.vendor : '',
          Type: idx === 0 ? product.type : '',
          Tags: idx === 0 ? tags : '',
          Published: idx === 0 ? (product.published ? 'TRUE' : 'FALSE') : '',
          'Option1 Name': idx === 0 ? product.option1Name : '',
          'Option1 Value': idx === 0 ? product.option1Value : '',
          'Variant SKU': idx === 0 ? sku : '',
          'Variant Price': idx === 0 ? product.variantPrice : '',
          'Variant Compare At Price': idx === 0 ? product.variantComparePrice : '',
          'Image Src': img,
          'Image Position': (idx + 1).toString(),
          'Metafield: impact_hours [number_integer]': idx === 0 ? product.impactHours : ''
        });
      });
    }
  });

  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_PATH,
    header: [
      { id: 'Handle', title: 'Handle' },
      { id: 'Title', title: 'Title' },
      { id: 'Body (HTML)', title: 'Body (HTML)' },
      { id: 'Vendor', title: 'Vendor' },
      { id: 'Type', title: 'Type' },
      { id: 'Tags', title: 'Tags' },
      { id: 'Published', title: 'Published' },
      { id: 'Option1 Name', title: 'Option1 Name' },
      { id: 'Option1 Value', title: 'Option1 Value' },
      { id: 'Variant SKU', title: 'Variant SKU' },
      { id: 'Variant Price', title: 'Variant Price' },
      { id: 'Variant Compare At Price', title: 'Variant Compare At Price' },
      { id: 'Image Src', title: 'Image Src' },
      { id: 'Image Position', title: 'Image Position' },
      { id: 'Metafield: impact_hours [number_integer]', title: 'Metafield: impact_hours [number_integer]' }
    ]
  });

  await csvWriter.writeRecords(rows);
  console.log(`  ✅ Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
}

// ─── MAIN ───
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Homeboy Threads — Product Importer');
  console.log('═══════════════════════════════════════\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Step 1 & 2: Scrape both platforms
    const [poshmarkListings, depopListings] = await Promise.all([
      scrapePoshmark(browser),
      scrapeDepop(browser)
    ]);

    const allListings = [...poshmarkListings, ...depopListings];
    console.log(`\n📊 Total raw listings: ${allListings.length}`);

    if (allListings.length === 0) {
      console.log('⚠ No listings found. The pages may have changed structure.');
      console.log('  Check that the closet/shop URLs are correct and accessible.');
      await browser.close();
      return;
    }

    // Step 3: Normalize
    const normalized = normalizeListings(allListings);

    // De-duplicate by handle (for re-runs)
    const seen = new Set();
    const deduped = normalized.filter(p => {
      if (seen.has(p.handle)) return false;
      seen.add(p.handle);
      return true;
    });
    console.log(`  📊 After dedup: ${deduped.length} unique products`);

    // Step 4: Output CSV
    await writeCsv(deduped);

    console.log('\n═══════════════════════════════════════');
    console.log('  ✅ Import complete!');
    console.log(`  📄 CSV: ${OUTPUT_PATH}`);
    console.log('  📋 Next: Upload to Shopify Admin → Products → Import');
    console.log('═══════════════════════════════════════\n');
  } catch (err) {
    console.error('❌ Fatal error:', err);
  } finally {
    await browser.close();
  }
}

main();

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://shop.homeboythreads.com/products.json';
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'homeboy-products-import.csv');

// Shopify CSV columns
const CSV_HEADERS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type',
  'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name',
  'Option2 Value', 'Option3 Name', 'Option3 Value', 'Variant SKU',
  'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty',
  'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
  'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
  'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text',
  'Gift Card', 'SEO Title', 'SEO Description', 'Variant Image',
  'Variant Weight Unit', 'Variant Tax Code', 'Cost per item', 'Status'
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      const opts = new URL(u);
      opts.headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      };
      https.get(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${u}: ${e.message}`));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

async function fetchAllProducts() {
  const allProducts = [];
  let page = 1;

  while (true) {
    const url = `${SOURCE_URL}?limit=250&page=${page}`;
    console.log(`Fetching page ${page}...`);
    const data = await fetchJSON(url);

    if (!data.products || data.products.length === 0) break;

    allProducts.push(...data.products);
    console.log(`  Got ${data.products.length} products (total: ${allProducts.length})`);

    if (data.products.length < 250) break;
    page++;
  }

  return allProducts;
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function hasNWT(product) {
  for (const option of product.options) {
    for (const val of option.values) {
      if (val.toLowerCase().includes('new with tags')) return true;
    }
  }
  for (const variant of product.variants) {
    for (const optVal of [variant.option1, variant.option2, variant.option3]) {
      if (optVal && optVal.toLowerCase().includes('new with tags')) return true;
    }
  }
  return false;
}

function buildTags(product) {
  const tags = [...(product.tags || [])];
  tags.push('designer-donated');
  if (hasNWT(product)) tags.push('nwt');
  return tags.join(', ');
}

function buildSEOTitle(product) {
  return `${product.title} | ${product.vendor} Resale | Homeboy Threads`;
}

function makeRow(fields) {
  const row = {};
  for (const h of CSV_HEADERS) row[h] = '';
  Object.assign(row, fields);
  return CSV_HEADERS.map((h) => escapeCSV(row[h])).join(',');
}

function productToCSVRows(product) {
  const rows = [];
  const handle = product.handle;
  const tags = buildTags(product);
  const seoTitle = buildSEOTitle(product);
  const firstImage = product.images[0];

  const option1Name = product.options[0] ? product.options[0].name : '';
  const option2Name = product.options[1] ? product.options[1].name : '';
  const option3Name = product.options[2] ? product.options[2].name : '';

  // First variant row includes all product-level fields
  for (let vi = 0; vi < product.variants.length; vi++) {
    const variant = product.variants[vi];
    const isFirst = vi === 0;

    const fields = {
      Handle: handle,
    };

    if (isFirst) {
      fields['Title'] = product.title;
      fields['Body (HTML)'] = product.body_html || '';
      fields['Vendor'] = product.vendor;
      fields['Product Category'] = '';
      fields['Type'] = product.product_type || '';
      fields['Tags'] = tags;
      fields['Published'] = 'TRUE';
      fields['SEO Title'] = seoTitle;
      fields['SEO Description'] = '';
      fields['Gift Card'] = 'FALSE';
      fields['Status'] = 'active';
    }

    if (isFirst || option1Name) fields['Option1 Name'] = option1Name || 'Title';
    fields['Option1 Value'] = variant.option1 || 'Default Title';
    if (option2Name) {
      fields['Option2 Name'] = option2Name;
      fields['Option2 Value'] = variant.option2 || '';
    }
    if (option3Name) {
      fields['Option3 Name'] = option3Name;
      fields['Option3 Value'] = variant.option3 || '';
    }

    fields['Variant SKU'] = variant.sku || '';
    fields['Variant Grams'] = variant.grams || 0;
    fields['Variant Inventory Tracker'] = 'shopify';
    fields['Variant Inventory Qty'] = 1;
    fields['Variant Inventory Policy'] = 'deny';
    fields['Variant Fulfillment Service'] = 'manual';
    fields['Variant Price'] = variant.price;
    fields['Variant Compare At Price'] = variant.compare_at_price || '';
    fields['Variant Requires Shipping'] = variant.requires_shipping ? 'TRUE' : 'FALSE';
    fields['Variant Taxable'] = variant.taxable ? 'TRUE' : 'FALSE';
    fields['Variant Barcode'] = '';
    fields['Variant Weight Unit'] = 'g';
    fields['Variant Tax Code'] = '';
    fields['Cost per item'] = '';

    // Attach variant's featured image if it has one
    if (variant.featured_image) {
      fields['Variant Image'] = variant.featured_image.src;
    }

    // First variant row gets the first image
    if (isFirst && firstImage) {
      fields['Image Src'] = firstImage.src;
      fields['Image Position'] = 1;
      fields['Image Alt Text'] = product.title;
    }

    rows.push(makeRow(fields));
  }

  // Additional image rows (images beyond the first)
  for (let i = 1; i < product.images.length; i++) {
    const img = product.images[i];
    rows.push(makeRow({
      Handle: handle,
      'Image Src': img.src,
      'Image Position': i + 1,
      'Image Alt Text': product.title,
    }));
  }

  return rows;
}

async function main() {
  console.log('=== Homeboy Threads Product Migration ===\n');

  const products = await fetchAllProducts();
  console.log(`\nFetched ${products.length} products total.\n`);

  if (products.length === 0) {
    console.log('No products found. Exiting.');
    process.exit(0);
  }

  // Generate CSV
  const csvLines = [CSV_HEADERS.join(',')];
  let totalVariants = 0;
  let totalImages = 0;
  const vendorCounts = {};

  for (const product of products) {
    const rows = productToCSVRows(product);
    csvLines.push(...rows);

    totalVariants += product.variants.length;
    totalImages += product.images.length;

    const vendor = product.vendor || 'Unknown';
    vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
  }

  // Write CSV
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf-8');

  // Print summary
  console.log('--- Migration Summary ---');
  console.log(`Total products:  ${products.length}`);
  console.log(`Total variants:  ${totalVariants}`);
  console.log(`Total images:    ${totalImages}`);
  console.log(`CSV rows:        ${csvLines.length - 1} (excluding header)`);
  console.log(`Output file:     ${OUTPUT_FILE}`);
  console.log('');
  console.log('Vendor Breakdown:');

  const sorted = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]);
  for (const [vendor, count] of sorted) {
    console.log(`  ${vendor}: ${count}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

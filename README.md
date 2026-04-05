# Homeboy Threads — Shopify 2.0 Theme

Complete Shopify 2.0 theme built on Dawn for Homeboy Threads, the retail arm of Homeboy Industries.

## Theme Installation

### Upload to Shopify

1. Zip the `/theme` directory:
   ```bash
   cd theme && zip -r ../homeboy-threads-theme.zip . && cd ..
   ```

2. Go to **Shopify Admin → Online Store → Themes**

3. Click **Add theme → Upload zip file**

4. Upload `homeboy-threads-theme.zip`

5. Click **Customize** to preview, then **Publish** when ready

### Theme Structure

```
theme/
├── assets/           CSS, JS, font declarations
│   ├── base.css              Global styles, variables, utilities
│   ├── component-product-card.css   Product card component
│   ├── sections.css          All section-specific styles
│   └── theme.js              Client-side JS (cart, filters, menu, wishlist)
├── config/           Theme settings
│   ├── settings_schema.json  Setting definitions for theme editor
│   └── settings_data.json    Pre-populated default values
├── layout/           Base template
│   └── theme.liquid          Main layout with fonts, SEO, structured data
├── sections/         One file per section
│   ├── announcement-bar.liquid
│   ├── header.liquid
│   ├── hero.liquid
│   ├── brand-bar.liquid
│   ├── featured-collection.liquid
│   ├── mission-strip.liquid
│   ├── how-it-works.liquid
│   ├── brand-spotlight.liquid
│   ├── email-capture.liquid
│   ├── trust-bar.liquid
│   ├── footer.liquid
│   ├── main-collection.liquid
│   ├── main-product.liquid
│   ├── main-our-story.liquid
│   ├── header-group.json
│   └── footer-group.json
├── snippets/         Reusable components
│   ├── product-card.liquid
│   ├── badge.liquid
│   └── impact-line.liquid
├── templates/        JSON templates
│   ├── index.json
│   ├── collection.json
│   ├── product.json
│   └── page.our-story.json
└── locales/
    └── en.default.json
```

## Editing Content

All sections are fully editable in the Shopify theme editor (**Customize** button):

- **Homepage sections**: Reorder, edit text, swap collections, update stats
- **Product cards**: Automatically pull brand, price, condition, and impact data from product data
- **Brand Bar**: Add/remove brand names as blocks
- **Mission Strip**: Edit stats and copy
- **Email Capture**: Change headline, perks, success message
- **Footer**: Edit link columns, social links, tagline

### Theme Settings (gear icon in editor)

- **Colors**: All brand colors (cream, charcoal, accent, forest, gold, etc.)
- **Impact Counter**: Update the "lbs diverted" number shown in nav
- **SEO**: Homepage meta title and description
- **Social Media**: Instagram, TikTok, Facebook URLs
- **Shipping**: Free shipping threshold

## Product Setup

### Required Product Fields

For the theme to display products correctly:

- **Vendor**: Set to the brand name (e.g., "Reformation") — shown above product title
- **Tags**: Add condition tags (`nwt`, `grade-a`, `grade-b`) and collection tags (`dresses`, `tops`, `denim`, `outerwear`)
- **Compare at price**: Set to retail price for % savings display
- **Metafield `impact_hours`** (number_integer): Hours of programming the sale funds (calculate as price / 35)

### Collections to Create

Create these collections in Shopify Admin → Products → Collections:

| Handle | Title | Type |
|--------|-------|------|
| `new-with-tags` | New With Tags | Automated: tag = `nwt` |
| `designer-donated` | Designer Donated | Automated: tag = `designer-donated` |
| `dresses` | Dresses | Automated: tag = `dresses` |
| `tops` | Tops & Blouses | Automated: tag = `tops` |
| `denim` | Denim | Automated: tag = `denim` |
| `outerwear` | Jackets & Coats | Automated: tag = `outerwear` |
| `reformation` | Reformation | Automated: vendor = `Reformation` |
| `guess` | Guess | Automated: vendor = `Guess` |
| `sale` | Sale | Automated: compare at price > price |

### Pages to Create

- **Our Story** (`/pages/our-story`): Assign the `page.our-story` template

## Product Migration from Source Store

The `/scripts/migrate-products.js` script fetches all products from the source store (`shop.homeboythreads.com`) and converts them into a Shopify-compatible import CSV.

### What the script does

- Fetches all products via the Shopify storefront `/products.json` API, paginating through all pages
- Preserves title, description (HTML), vendor, images (in order), and all variants with their options (Color, Size, Condition)
- Adds the `designer-donated` tag to every product
- Adds the `nwt` tag to any product with a "New with Tags" option value
- Sets `Variant Inventory Qty` to 1 and `Variant Inventory Policy` to deny for all variants
- Sets `Published` to TRUE and `Status` to active
- Generates an SEO Title in the format: `[Product Title] | [Vendor] Resale | Homeboy Threads`
- Outputs additional image-only rows (Handle + Image Src) for products with multiple images

### Run

```bash
node scripts/migrate-products.js
```

No dependencies required — uses only Node.js built-in modules (`https`, `fs`, `path`).

### Output

Generates `output/homeboy-products-import.csv` in the exact Shopify product import CSV format, plus a summary showing total products, variants, images, and vendor breakdown.

### Import to Shopify

1. Go to **Shopify Admin → Products → Import**
2. Click **Add file** and upload `output/homeboy-products-import.csv`
3. Review the preview — check that products, variants, and images look correct
4. **Check the "Overwrite products with matching handles" box** to update existing products instead of creating duplicates
5. Click **Import products** and wait for the import to complete

## SEO

The theme includes:

- **Dynamic meta titles** by page type (homepage, collection, product)
- **JSON-LD structured data**: Organization (NGO), Product, BreadcrumbList
- **Canonical URLs**: Prevents duplicate content from filtered collection pages
- **Collection SEO text**: Editable via collection metafield `custom.seo_description`

SEO configuration reference: `/config/seo-config.json`

## Design System

| Token | Value |
|-------|-------|
| Headline font | Playfair Display (400, 600) |
| Body font | DM Sans (300, 400, 500) |
| Mono font | DM Mono (400) |
| Cream | `#F5F0E8` |
| Warm White | `#FAF8F4` |
| Charcoal | `#1C1C1A` |
| Accent (Terracotta) | `#C84B2F` |
| Forest Green | `#2D4A35` |
| Gold | `#B8963E` |

## Technical Notes

- **Shopify Basic plan** compatible — no Plus features used
- **Dawn 2.0** base — passes Shopify theme check
- **Mobile-first** — all layouts work on iPhone 14 viewport
- **Lazy loading** — all images below fold use `loading="lazy"`
- **Accessibility** — keyboard navigation, ARIA labels, skip-to-content link
- **No render-blocking resources** — fonts use `display=swap`

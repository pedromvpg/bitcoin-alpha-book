# Bitcoin Alpha v0.01 - Source Code Book

A print-ready book containing the complete annotated source code of Bitcoin v0.01, 
the first public release by Satoshi Nakamoto in January 2009.

## Specifications

- **Size:** 7" × 10" (Executive)
- **Pages:** ~274
- **Paper:** 60# White Uncoated
- **Binding:** Paperback Perfect Bound
- **Cover:** Glossy

## Quick Start

```bash
# Install dependencies
npm install

# Download Bitcoin v0.01 source code
npm run fetch

# Build the HTML book
npm run build

# Preview in browser
npm run preview

# Generate PDF
npm run pdf
```

## Project Structure

```
bitcoin-alpha-book/
├── src/
│   ├── bitcoin-0.01/          # Original source code (fetched)
│   └── annotations/           # YAML annotation files
├── styles/
│   ├── print.css              # Page dimensions & layout
│   ├── syntax.css             # Code highlighting theme
│   └── typography.css         # Fonts & text styles
├── scripts/
│   ├── fetch-source.js        # Downloads Bitcoin source
│   ├── build.js               # Generates HTML/PDF
│   └── preview.js             # Local preview server
├── output/
│   ├── bitcoin-alpha-book.html
│   └── bitcoin-alpha-book.pdf
└── package.json
```

## Adding Annotations

Create YAML files in `src/annotations/` matching source filenames:

```yaml
# src/annotations/main.cpp.yaml
file: "main.cpp"
title: "The Heart of Bitcoin"

introduction: |
  This file contains the core Bitcoin logic...

annotations:
  - line: 42
    type: margin
    text: "Genesis block creation"
  
  - lines: [100, 150]
    type: block
    title: "Proof of Work"
    text: |
      This section implements the mining algorithm...

conclusion: |
  Summary of the file's purpose...
```

### Annotation Types

| Type | Description |
|------|-------------|
| `margin` | Short note in the margin beside a line |
| `block` | Explanation box between code sections |
| `highlight` | Visual highlight on specific lines |

### Highlight Categories

- `genesis-block` - Gold highlight for Genesis block code
- `proof-of-work` - Blue highlight for mining code
- `transaction` - Green highlight for transaction handling
- `crypto` - Purple highlight for cryptographic operations

## Customization

### Page Dimensions

Edit `styles/print.css`:

```css
@page {
  size: 7in 10in;  /* Change dimensions here */
  margin: 0.75in 0.625in 0.875in 0.75in;
}
```

### Syntax Theme

Edit `styles/syntax.css` to customize code colors.

### Typography

Edit `styles/typography.css` for fonts and text styles.

## Requirements

- Node.js 18+
- npm

## License

The Bitcoin source code is under the MIT License by Satoshi Nakamoto.
Book generation tools are provided as-is.

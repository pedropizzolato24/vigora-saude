// Paste inside module.exports.theme.extend in tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        creme: '#F4EFE5',
        terracota: '#C96442',
        azul: '#1E4D8C',
        ambar: '#F0C24A',
        dark: '#0E1417',
        muted: '#5B636A',
        border: '#D8D1C2',
        success: '#0F8A4A',
        error: '#D6161C',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Plus Jakarta Sans', 'Helvetica', 'sans-serif'],
        mono: ['Space Mono', 'Courier New', 'monospace'],
      },
      fontSize: {
        'h1': ['44px', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'h2': ['28px', { lineHeight: '1.2' }],
        'h3': ['20px', { lineHeight: '1.3', fontWeight: '700' }],
        'body': ['15px', { lineHeight: '1.65' }],
        'body-a11y': ['18px', { lineHeight: '1.7' }],
        'label': ['9px', { lineHeight: '1', letterSpacing: '0.25em' }],
        'caption': ['12px', { lineHeight: '1.5' }],
      },
      borderRadius: {
        'brand-sm': '8px',
        'brand-md': '12px',
        'brand-lg': '18px',
      },
      boxShadow: {
        'brand-sm': '0 1px 3px rgba(14,20,23,0.08)',
        'brand-md': '0 4px 12px rgba(14,20,23,0.12)',
        'brand-lg': '0 8px 24px rgba(14,20,23,0.16)',
      },
    },
  },
};

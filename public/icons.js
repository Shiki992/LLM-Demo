// Simple line-art product glyphs, shared by the store and rep console.
window.ICONS = {
  boot: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M18 8h16v22l14 6c5 2 8 6 8 11v5H8V36c3-2 6-6 8-12z"/><path d="M8 52h48M22 16h10M22 22h10M21 28h11"/></svg>',
  jacket: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M24 8l8 6 8-6 12 6 6 18-8 3v21H14V35l-8-3 6-18z"/><path d="M32 14v42M26 8c0 5 3 8 6 8s6-3 6-8"/></svg>',
  pack: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><rect x="16" y="14" width="32" height="42" rx="9"/><path d="M24 14c0-5 3-8 8-8s8 3 8 8M22 36h20v12H22zM16 30h32"/></svg>',
  fleece: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M22 8h20l14 8-5 14-6-3v29H19V27l-6 3-5-14z"/><path d="M26 8l6 10 6-10M32 18v38"/></svg>',
  tent: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M32 10L6 52h52z"/><path d="M32 10v42M32 52l-9-16M32 52l9-16M2 52h60"/></svg>',
  poles: '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M22 6l6 52M42 6l-6 52"/><path d="M18 8h9M37 8h9M20 20h6M38 20h6"/></svg>',
};
window.money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

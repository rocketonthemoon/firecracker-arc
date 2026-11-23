// Home: product grid, each card links to /product?id=N
(async () => {
  const grid = document.getElementById('products');
  const { ok, data } = await getJson('/api/products');
  if (!ok) { grid.append(el('p', { textContent: 'Could not load products.' })); return; }

  for (const p of data) {
    grid.append(el('a', { className: 'card', href: `/product?id=${p.id}` },
      el('img', { src: p.image, alt: p.name, loading: 'lazy' }),
      el('small', { className: 'muted', textContent: p.category }),
      el('h3', { textContent: p.name }),
      el('div', { className: 'price', textContent: money(p.price) }),
      stockLabel(p.stock),
    ));
  }
})();

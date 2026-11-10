// ── Product page (product.html?id=...) ───────────────────────
// Uses loadProducts, loadSettings, productsById, priceHtml, tagsHtml, comboNoteHtml,
// productVariants, productPhotos, sizedImage, escapeHtml, addToCart and IMG_ONERROR from app.js

const CATEGORY_PAGES = {
  sneakers: { name: 'Sneakers', page: 'sneakers.html', kicker: 'Footwear' },
  kids:     { name: 'Kids Sneakers', page: 'kids.html', kicker: 'Kids Footwear' },
  hair:     { name: 'Hair', page: 'hair.html', kicker: 'Hair &amp; Wigs' },
};

const pageEl = document.getElementById('product-page');
const productId = new URLSearchParams(location.search).get('id') || '';

function showMissing(message) {
  pageEl.innerHTML = `
    <div class="pdp-missing">
      <h1>${message}</h1>
      <p>It may have sold out or been taken off the shop.</p>
      <a href="products.html" class="btn">Browse all products</a>
    </div>`;
}

function galleryHtml(p) {
  const photos = productPhotos(p);
  const name = escapeHtml(p.name);
  const many = photos.length > 1;
  return `
    <div class="pdp-gallery${p.category === 'hair' ? ' pdp-gallery-hair' : ''}">
      <div class="pdp-main">
        <img class="pdp-main-img" src="${escapeHtml(sizedImage(photos[0], 1200, 900))}" alt="${name}, photo 1 of ${photos.length}" onerror="${IMG_ONERROR}"/>
        ${tagsHtml(p)}
        ${many ? `
        <button type="button" class="pdp-nav pdp-nav-prev" aria-label="Previous photo">&#8249;</button>
        <button type="button" class="pdp-nav pdp-nav-next" aria-label="Next photo">&#8250;</button>` : ''}
      </div>
      ${many ? `
      <div class="pdp-thumbs">
        ${photos.map((url, i) => `
          <button type="button" class="pdp-thumb${i === 0 ? ' active' : ''}" data-index="${i}"
                  aria-label="Show photo ${i + 1} of ${photos.length}"${i === 0 ? ' aria-current="true"' : ''}>
            <img src="${escapeHtml(sizedImage(url, 240, 240))}" alt="" loading="lazy" onerror="${IMG_ONERROR}"/>
          </button>`).join('')}
      </div>` : ''}
    </div>`;
}

// Arrows, thumbnails, swipe and the ← → keys all move through the same photos
function bindGallery(p) {
  const photos = productPhotos(p);
  if (photos.length < 2) return;
  const main = pageEl.querySelector('.pdp-main-img');
  const thumbs = [...pageEl.querySelectorAll('.pdp-thumb')];
  let current = 0;

  const show = i => {
    current = (i + photos.length) % photos.length;
    main.setAttribute('onerror', IMG_ONERROR);
    main.src = sizedImage(photos[current], 1200, 900);
    main.alt = `${p.name}, photo ${current + 1} of ${photos.length}`;
    thumbs.forEach((t, n) => {
      t.classList.toggle('active', n === current);
      t.toggleAttribute('aria-current', n === current);
    });
    thumbs[current].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  pageEl.querySelector('.pdp-nav-prev').addEventListener('click', () => show(current - 1));
  pageEl.querySelector('.pdp-nav-next').addEventListener('click', () => show(current + 1));
  thumbs.forEach(t => t.addEventListener('click', () => show(Number(t.dataset.index))));

  let touchX = null;
  main.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft')  show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
}

function optionsHtml(p) {
  if (p.category === 'hair') {
    return `
      <div class="pdp-option">
        <div class="pdp-option-label">Length (inches)</div>
        <div class="pdp-sizes" role="group" aria-label="Length">
          ${(p.options.lengths || []).map(i => `<button type="button" class="pdp-size" data-length="${i}" aria-pressed="false">${i}"</button>`).join('')}
        </div>
      </div>`;
  }
  const colours = p.options.colours || [];
  return `
    <div class="pdp-option">
      <div class="pdp-option-label">Colour: <span class="pdp-colour-name">${colours.length === 1 ? escapeHtml(colours[0].name) : 'choose one'}</span></div>
      <div class="pdp-colours" role="group" aria-label="Colour">
        ${colours.map(c => `<button type="button" class="colour-swatch" data-colour="${escapeHtml(c.hex)}" style="background:${escapeHtml(c.hex)};" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" aria-pressed="false"></button>`).join('')}
      </div>
    </div>
    <div class="pdp-option">
      <div class="pdp-option-label">Size (SA)</div>
      <div class="pdp-sizes" role="group" aria-label="Size">
        ${(p.options.sizes || []).map(s => `<button type="button" class="pdp-size" data-size="${s}" aria-pressed="false">${s}</button>`).join('')}
      </div>
    </div>`;
}

function detailsHtml(p) {
  return `
    <div class="pdp-details">
      ${p.description ? `
      <details open>
        <summary>Product Information</summary>
        <p>${escapeHtml(p.description)}</p>
      </details>` : ''}
      <details>
        <summary>Delivery &amp; Returns</summary>
        <p>Standard delivery takes about 2 weeks from payment, by courier to your door or to a PAXI collection point. Express delivery, when available, is shown at checkout.</p>
        <p><a href="shipping.html">Shipping and Delivery Policy</a> &middot; <a href="returns.html">Return, Exchange &amp; Refund Policy</a></p>
      </details>
    </div>`;
}

// Search engines read these after the page runs: the product's own description,
// address, and name/price/photos as structured data
function setSearchInfo(p) {
  const url = `https://ushotistyle.co.za/product?id=${encodeURIComponent(p.id)}`;
  const text = (p.description || `${p.name} at Ushoti Style, delivered across South Africa.`).replace(/\s+/g, ' ').trim();
  document.querySelector('meta[name="description"]')?.setAttribute('content', text.length > 160 ? text.slice(0, 157) + '...' : text);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);

  const prices = productVariants(p).map(v => v.price);
  const low = prices.length ? Math.min(...prices) : p.price;
  const high = prices.length ? Math.max(...prices) : p.price;
  const offers = low === high
    ? { '@type': 'Offer', price: low, priceCurrency: 'ZAR', availability: 'https://schema.org/InStock', url }
    : { '@type': 'AggregateOffer', lowPrice: low, highPrice: high, priceCurrency: 'ZAR', availability: 'https://schema.org/InStock', url };
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: productPhotos(p).map(src => new URL(src, 'https://ushotistyle.co.za/').href),
    offers,
  };
  if (p.description) data.description = p.description;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  document.head.appendChild(script);
}

function renderProduct(p) {
  const cat = CATEGORY_PAGES[p.category] || CATEGORY_PAGES.sneakers;
  const hair = p.category === 'hair';
  document.title = `${p.name} | Ushoti Style`;
  setSearchInfo(p);
  document.querySelector(`.nav-links a[href="${hair ? 'hair.html' : 'sneakers.html'}"]`)?.classList.add('active');

  pageEl.innerHTML = `
    <div class="pdp-breadcrumb" role="navigation" aria-label="Breadcrumb">
      <a href="index.html">Home</a><span aria-hidden="true">/</span>
      <a href="${cat.page}">${cat.name}</a><span aria-hidden="true">/</span>
      <span aria-current="page">${escapeHtml(p.name)}</span>
    </div>
    <div class="pdp-layout${hair ? ' pdp-layout-hair' : ''}">
      ${galleryHtml(p)}
      <div class="pdp-info">
        <p class="pdp-kicker">${cat.kicker}</p>
        <h1 class="pdp-title">${escapeHtml(p.name)}</h1>
        <div class="pdp-price">${priceHtml(p)}</div>
        ${comboNoteHtml(p, { details: true })}
        ${optionsHtml(p)}
        <p class="pdp-selection" id="pdp-selection" aria-live="polite">${hair ? 'Select a length' : 'Select a size and colour'}</p>
        <button type="button" class="pdp-add" id="pdp-add" disabled>Add to Cart</button>
        <a href="cart.html" class="pdp-view-cart">View cart</a>
        ${detailsHtml(p)}
      </div>
    </div>`;

  bindGallery(p);
  if (hair) bindHairOptions(p);
  else bindSneakerOptions(p);
}

function selectButton(buttons, btn) {
  buttons.forEach(b => {
    b.classList.toggle('selected', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  });
}

function bindSneakerOptions(p) {
  const colours = p.options.colours || [];
  const sizeBtns = [...pageEl.querySelectorAll('.pdp-size')];
  const swatches = [...pageEl.querySelectorAll('.colour-swatch')];
  const info = document.getElementById('pdp-selection');
  const addBtn = document.getElementById('pdp-add');
  const colourName = hex => (colours.find(c => c.hex === hex) || {}).name || hex;
  let size = null;
  let colour = null;

  const update = () => {
    addBtn.disabled = !(size && colour);
    info.textContent = size && colour ? `Size ${size} · ${colourName(colour)}`
      : size ? `Size ${size} selected — pick a colour`
      : colour ? `${colourName(colour)} selected — pick a size`
      : 'Select a size and colour';
  };

  sizeBtns.forEach(btn => btn.addEventListener('click', () => {
    selectButton(sizeBtns, btn);
    size = btn.dataset.size;
    update();
  }));
  swatches.forEach(sw => sw.addEventListener('click', () => {
    selectButton(swatches, sw);
    colour = sw.dataset.colour;
    pageEl.querySelector('.pdp-colour-name').textContent = colourName(colour);
    update();
  }));
  if (swatches.length === 1) swatches[0].click(); // nothing to choose

  addBtn.addEventListener('click', () => {
    addToCart(`${p.id}-${size}-${colour}`, `${p.name} (Size ${size}, ${colourName(colour)})`, p.price, sizedImage(p.image, 80, 80));
  });
}

function bindHairOptions(p) {
  const btns = [...pageEl.querySelectorAll('.pdp-size')];
  const info = document.getElementById('pdp-selection');
  const addBtn = document.getElementById('pdp-add');
  let length = null;
  let price = p.price;

  btns.forEach(btn => btn.addEventListener('click', () => {
    selectButton(btns, btn);
    length = btn.dataset.length;
    // Hair can have its own price for each length
    const variant = productVariants(p).find(v => v.length === Number(length));
    if (variant) {
      price = variant.price;
      pageEl.querySelector('.pdp-price').innerHTML = priceHtml(variant);
    }
    info.textContent = `${length}" selected`;
    addBtn.disabled = false;
  }));

  addBtn.addEventListener('click', () => {
    addToCart(`${p.id}-${length}in`, `${p.name} (${length}")`, price, sizedImage(p.image, 80, 80));
  });
}

// The combo deal tag needs the settings, but the product shows without them
Promise.all([loadProducts(), loadSettings().catch(() => null)])
  .then(() => {
    const p = productsById[productId];
    if (p) renderProduct(p);
    else showMissing('Sorry, this product is no longer available');
  })
  .catch(() => {
    pageEl.innerHTML = '<p class="products-status">We couldn\'t load this product right now. Please refresh the page.</p>';
  });

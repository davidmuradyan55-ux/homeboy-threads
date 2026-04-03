/* ══════════════════════════════════════════
   HOMEBOY THREADS — THEME JS
   ══════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── Mobile Menu ── */
  const mobileToggle = document.querySelector('.header__mobile-toggle');
  const mobileOverlay = document.querySelector('.header__mobile-overlay');
  const mobileClose = document.querySelector('.header__mobile-close');

  if (mobileToggle && mobileOverlay) {
    mobileToggle.addEventListener('click', function() {
      mobileOverlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      mobileClose && mobileClose.focus();
    });

    if (mobileClose) {
      mobileClose.addEventListener('click', function() {
        mobileOverlay.classList.remove('is-open');
        document.body.style.overflow = '';
        mobileToggle.focus();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobileOverlay.classList.contains('is-open')) {
        mobileOverlay.classList.remove('is-open');
        document.body.style.overflow = '';
        mobileToggle.focus();
      }
    });
  }

  /* ── Category Filter Pills ── */
  document.querySelectorAll('.category-nav').forEach(function(nav) {
    var pills = nav.querySelectorAll('.category-nav__pill');
    var grid = nav.parentElement.querySelector('.product-grid');

    pills.forEach(function(pill) {
      pill.addEventListener('click', function() {
        pills.forEach(function(p) { p.classList.remove('is-active'); });
        pill.classList.add('is-active');

        if (!grid) return;
        var filter = pill.getAttribute('data-filter');
        var cards = grid.querySelectorAll('.product-card');

        cards.forEach(function(card) {
          if (!filter || filter === 'all') {
            card.style.display = '';
          } else {
            var tags = card.getAttribute('data-tags') || '';
            card.style.display = tags.indexOf(filter) !== -1 ? '' : 'none';
          }
        });
      });
    });
  });

  /* ── Quick Add to Cart ── */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.product-card__quick-add');
    if (!btn) return;
    e.preventDefault();

    var variantId = btn.getAttribute('data-variant-id');
    if (!variantId) return;

    btn.textContent = 'Adding...';
    btn.disabled = true;

    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(variantId, 10), quantity: 1 })
    })
    .then(function(res) { return res.json(); })
    .then(function() {
      btn.textContent = 'Added!';
      updateCartCount();
      setTimeout(function() {
        btn.textContent = 'Quick Add';
        btn.disabled = false;
      }, 1500);
    })
    .catch(function() {
      btn.textContent = 'Error';
      setTimeout(function() {
        btn.textContent = 'Quick Add';
        btn.disabled = false;
      }, 1500);
    });
  });

  /* ── Update Cart Count ── */
  function updateCartCount() {
    fetch('/cart.js')
      .then(function(res) { return res.json(); })
      .then(function(cart) {
        document.querySelectorAll('.header__cart-count').forEach(function(el) {
          el.textContent = '(' + cart.item_count + ')';
        });
      });
  }

  /* ── Email Capture ── */
  document.querySelectorAll('.email-capture__form').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var input = form.querySelector('.email-capture__input');
      var email = input ? input.value : '';
      if (!email) return;

      var section = form.closest('.email-capture');
      var successEl = section ? section.querySelector('.email-capture__success') : null;

      fetch('/contact#contact_form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'form_type=customer&utf8=%E2%9C%93&customer%5Bemail%5D=' + encodeURIComponent(email) + '&customer%5Btags%5D=newsletter'
      })
      .then(function() {
        if (successEl) {
          form.style.display = 'none';
          var perks = section.querySelector('.email-capture__perks');
          if (perks) perks.style.display = 'none';
          successEl.classList.add('is-visible');
        }
      })
      .catch(function() {
        if (successEl) {
          successEl.textContent = 'Something went wrong. Please try again.';
          successEl.classList.add('is-visible');
        }
      });
    });
  });

  /* ── Wishlist (local storage) ── */
  document.addEventListener('click', function(e) {
    var heart = e.target.closest('.product-card__wishlist');
    if (!heart) return;
    e.preventDefault();
    e.stopPropagation();

    var productId = heart.getAttribute('data-product-id');
    if (!productId) return;

    var wishlist = JSON.parse(localStorage.getItem('hbt_wishlist') || '[]');
    var idx = wishlist.indexOf(productId);
    if (idx === -1) {
      wishlist.push(productId);
      heart.innerHTML = '&#9829;';
      heart.setAttribute('aria-label', 'Remove from wishlist');
    } else {
      wishlist.splice(idx, 1);
      heart.innerHTML = '&#9825;';
      heart.setAttribute('aria-label', 'Add to wishlist');
    }
    localStorage.setItem('hbt_wishlist', JSON.stringify(wishlist));
  });

  /* ── Product Gallery ── */
  document.querySelectorAll('.product-gallery__thumb').forEach(function(thumb) {
    thumb.addEventListener('click', function() {
      var src = thumb.querySelector('img').getAttribute('src');
      var mainImg = thumb.closest('.product-gallery').querySelector('.product-gallery__main img');
      if (mainImg && src) {
        mainImg.setAttribute('src', src);
      }
      thumb.parentElement.querySelectorAll('.product-gallery__thumb').forEach(function(t) {
        t.classList.remove('is-active');
      });
      thumb.classList.add('is-active');
    });
  });

  /* ── Product Page Variant Select ── */
  var variantSelect = document.querySelector('[data-variant-select]');
  if (variantSelect) {
    variantSelect.addEventListener('change', function() {
      var selectedOption = variantSelect.options[variantSelect.selectedIndex];
      var price = selectedOption.getAttribute('data-price');
      var comparePrice = selectedOption.getAttribute('data-compare-price');
      var available = selectedOption.getAttribute('data-available') === 'true';

      var priceEl = document.querySelector('.product-info__price');
      var comparePriceEl = document.querySelector('.product-info__compare-price');
      var addBtn = document.querySelector('.product-info__add-to-cart');

      if (priceEl && price) priceEl.textContent = price;
      if (comparePriceEl) {
        comparePriceEl.textContent = comparePrice || '';
        comparePriceEl.style.display = comparePrice ? '' : 'none';
      }
      if (addBtn) {
        addBtn.disabled = !available;
        addBtn.textContent = available ? 'Add to Cart' : 'Sold Out';
      }
    });
  }

})();

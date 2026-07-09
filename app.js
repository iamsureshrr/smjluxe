// --- FIREBASE LIVE ENVIRONMENT CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAA60xkGygpG9no7Qbq3xsxpCO5hupDHPE",
  authDomain: "my-earings-85407.firebaseapp.com",
  databaseURL: "https://my-earings-85407-default-rtdb.firebaseio.com",
  projectId: "my-earings-85407",
  storageBucket: "my-earings-85407.firebasestorage.app",
  messagingSenderId: "637254172278",
  appId: "1:637254172278:web:33e9741e7017564a5f2957"
};
// --------------------------------------------

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let products = [];
let shoppingCart = {}; 
let isAdmin = false;
let selectedCategoryFilter = "In Stock"; 
const WHATSAPP_NUMBER = "919342721847";

let uploadedImagesArray = []; // Holds items structured as "thumbnailData*hdData"
let currentSortState = "none"; // Options: "none", "highToLow", "lowToHigh"

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('manage') === 'true') {
    isAdmin = true;
    selectedCategoryFilter = "All";
    document.getElementById('add-prod-btn').style.display = "inline-flex";
    document.getElementById('store-title').innerText = "Jeevan Jewellery Admin";
    document.getElementById('chip-All').classList.add('active');
} else {
    document.getElementById('chip-InStock').classList.add('active');
}

// Fetch database records
database.ref('products').on('value', (snapshot) => {
    document.getElementById('loading-indicator').style.display = 'none';
    const data = snapshot.val();
    products = [];
    if (data) {
        Object.keys(data).forEach(key => {
            products.push({ dbKey: key, ...data[key] });
        });
    }
    filterStore(); // Directly trigger full display update
    if (document.getElementById('cartDrawer').style.display === "flex") {
        openCartDrawer();
    }
}, (error) => {
    console.error(error);
});

// Separates the fast preview element from high resolution source packages cleanly
function parseProductImage(imgStr, getHD = false) {
    const fallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='M21 15l-5-5L5 21'/></svg>";
    if (!imgStr || imgStr === "Local Image Loaded" || String(imgStr).trim() === "") return [fallback];

    let items = String(imgStr).split('|');
    return items.map(entry => {
        if (entry.includes('*')) {
            let parts = entry.split('*');
            return getHD ? parts[1] : parts[0]; 
        }
        return entry; 
    }).filter(str => str && str.length > 15);
}

function filterStore() {
    const searchQuery = document.getElementById('search-box').value.toLowerCase().trim();
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    // Filter logic
    let filtered = products.filter(p => {
        if (selectedCategoryFilter !== "All" && p.status !== selectedCategoryFilter) return false;
        const matchesName = p.name ? p.name.toLowerCase().includes(searchQuery) : false;
        const matchesCode = p.code ? p.code.toLowerCase().includes(searchQuery) : false;
        return searchQuery === "" || matchesName || matchesCode;
    });

    // Dynamic Sort Array Interceptor Pipeline
    if (currentSortState === "highToLow") {
        filtered.sort((a, b) => {
            let priceA = parseFloat(String(a.price || '0').replace(/[^0-9.]/g, '')) || 0;
            let priceB = parseFloat(String(b.price || '0').replace(/[^0-9.]/g, '')) || 0;
            return priceB - priceA;
        });
    } else if (currentSortState === "lowToHigh") {
        filtered.sort((a, b) => {
            let priceA = parseFloat(String(a.price || '0').replace(/[^0-9.]/g, '')) || 0;
            let priceB = parseFloat(String(b.price || '0').replace(/[^0-9.]/g, '')) || 0;
            return priceA - priceB;
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading" style="grid-column: span 2;">No products found.</div>';
        return;
    }

    // Loops and mounts every single matched inventory data record systematically
    filtered.forEach(product => {
        let overlayHTML = '';
        let displayPriceHTML = `<div class="product-price">₹${parseFloat(String(product.price || '0').replace(/[^0-9.]/g, '')) || 0}</div>`;
        let buttonHTML = '';
        let discountBadgeHTML = '';

        if (product.mrp && product.price && product.status !== "Coming Soon") {
            let numMRP = parseFloat(String(product.mrp).replace(/[^0-9.]/g, '')) || 0;
            let numPrice = parseFloat(String(product.price).replace(/[^0-9.]/g, '')) || 0;
            if (numMRP > numPrice) {
                let pct = Math.round(((numMRP - numPrice) / numMRP) * 100);
                if (pct > 0) discountBadgeHTML = `<div class="discount-badge">${pct}% OFF</div>`;
                displayPriceHTML = `<div class="product-price">₹${numPrice}</div><div class="product-mrp-crossed">₹${numMRP}</div>`;
            }
        }

        let stockCountHTML = (product.stock && parseInt(product.stock) > 0 && product.status === "In Stock") 
            ? `<div class="stock-count-label">Stock: ${product.stock}</div>` : '';

        const currentQty = shoppingCart[product.dbKey] || 0;
        if (currentQty > 0) {
            buttonHTML = `
                <div class="inline-qty-selector" onclick="event.stopPropagation();">
                    <button class="btn-qty" onclick="changeQty('${product.dbKey}', -1)">-</button>
                    <span>${currentQty}</span>
                    <button class="btn-qty" onclick="changeQty('${product.dbKey}', 1)">+</button>
                </div>`;
        } else {
            buttonHTML = `<button class="btn btn-primary" onclick="event.stopPropagation(); addToCart('${product.dbKey}')">Add to Cart</button>`;
        }
        
        if (product.status === "Sold") {
            overlayHTML = `<div class="status-overlay" style="background-color: rgba(220,38,38,0.5)">Sold</div>`;
            buttonHTML = `<button class="btn btn-secondary" disabled>Sold Out</button>`;
        } else if (product.status === "Out of Stock") {
            overlayHTML = `<div class="status-overlay" style="background-color: rgba(234,88,12,0.5)">Out of Stock</div>`;
            buttonHTML = `<button class="btn btn-secondary" disabled>No Stock</button>`;
        } else if (product.status === "Coming Soon") {
            overlayHTML = `<div class="status-overlay" style="background-color: rgba(30,41,59,0.6)">Coming Soon</div>`;
            displayPriceHTML = `<div class="product-price">****</div>`;
            buttonHTML = `<button class="btn btn-secondary" disabled>Coming Soon</button>`;
        }

        let adminButtons = isAdmin ? `
            <div class="admin-actions">
                <button class="btn btn-secondary" onclick="event.stopPropagation(); editProduct('${product.dbKey}')">Edit</button>
                <button class="btn btn-danger" onclick="event.stopPropagation(); deleteProduct('${product.dbKey}')">Delete</button>
            </div>` : '';

        const thumbnails = parseProductImage(product.img, false);
        const firstThumb = thumbnails[0];

        container.innerHTML += `
            <div class="product-card" onclick="openDetailsModal('${product.dbKey}')">
                <div class="img-container">
                    <img src="${firstThumb}" class="product-img" loading="lazy" alt="Product Image">
                    ${discountBadgeHTML}
                    ${stockCountHTML}
                    ${overlayHTML}
                </div>
                <div class="product-info">
                    <div>
                        <div class="product-code">${product.code || ''}</div>
                        <h3 class="product-title">${product.name || ''}</h3>
                        <div class="price-layout-container">${displayPriceHTML}</div>
                    </div>
                    <div>
                        <div class="card-actions">${buttonHTML}</div>
                        ${adminButtons}
                    </div>
                </div>
            </div>`;
    });
}

function selectCategory(category, element) {
    selectedCategoryFilter = category;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    filterStore();
}

function togglePriceSort() {
    const btn = document.getElementById('sort-toggle-btn');
    
    if (currentSortState === "none") {
        currentSortState = "highToLow";
        btn.innerHTML = "Price: High ➔ Low ⬇️";
        btn.style.backgroundColor = "var(--primary)";
        btn.style.color = "white";
    } else if (currentSortState === "highToLow") {
        currentSortState = "lowToHigh";
        btn.innerHTML = "Price: Low ➔ High ⬆️";
        btn.style.backgroundColor = "var(--primary)";
        btn.style.color = "white";
    } else {
        currentSortState = "none";
        btn.innerHTML = "Sort Price ↕️";
        btn.style.backgroundColor = "#e2e8f0";
        btn.style.color = "#475569";
    }
    
    filterStore();
}

function addToCart(dbKey) {
    if (!shoppingCart[dbKey] && Object.keys(shoppingCart).length >= 20) return;
    shoppingCart[dbKey] = 1; updateCartUI(); filterStore();
}

function changeQty(dbKey, delta) {
    if (!shoppingCart[dbKey]) return;
    const targetQty = shoppingCart[dbKey] + delta;
    if (targetQty <= 0) delete shoppingCart[dbKey];
    else if (targetQty > 10) return;
    else shoppingCart[dbKey] = targetQty;
    updateCartUI(); filterStore();
    if (document.getElementById('cartDrawer').style.display === "flex") {
        openCartDrawer();
    }
}

function updateCartUI() {
    const bar = document.getElementById('cart-sticky-bar');
    const uniqueKeys = Object.keys(shoppingCart);
    if (uniqueKeys.length === 0) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    let totalItems = 0; let totalPrice = 0;
    uniqueKeys.forEach(key => {
        const prod = products.find(p => p.dbKey === key);
        if (prod) {
            totalItems += shoppingCart[key];
            totalPrice += ((parseFloat(String(prod.price || '0').replace(/[^0-9.]/g, '')) || 0) * shoppingCart[key]);
        }
    });
    document.getElementById('cart-count').innerText = totalItems;
    document.getElementById('cart-total-price').innerText = "₹" + totalPrice;
    document.getElementById('drawer-total-price').innerText = "₹" + totalPrice;
}

// Drawer Visibility Controls
function openCartDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const container = document.getElementById('cart-items-container');
    container.innerHTML = '';
    
    let grandTotal = 0;
    const uniqueKeys = Object.keys(shoppingCart);
    
    if (uniqueKeys.length === 0) {
        container.innerHTML = '<div class="loading">Your bag is empty.</div>';
    } else {
        uniqueKeys.forEach(key => {
            const prod = products.find(p => p.dbKey === key);
            if (prod) {
                const qty = shoppingCart[key];
                const price = parseFloat(String(prod.price || '0').replace(/[^0-9.]/g, '')) || 0;
                const itemTotal = price * qty;
                grandTotal += itemTotal;
                
                container.innerHTML += `
                    <div class="cart-item">
                        <div class="cart-item-details">
                            <span class="cart-item-name">${prod.name || ''}</span>
                            <span class="cart-item-code">${prod.code || ''}</span>
                            <span style="font-size:0.8rem; color:var(--primary); font-weight:bold;">₹${price} each</span>
                        </div>
                        <div class="qty-controls">
                            <button class="btn-qty" onclick="changeQty('${key}', -1)">-</button>
                            <span style="font-weight:bold; min-width:20px; text-align:center;">${qty}</span>
                            <button class="btn-qty" onclick="changeQty('${key}', 1)">+</button>
                            <span style="font-weight:bold; margin-left:0.5rem; min-width:60px; text-align:right;">₹${itemTotal}</span>
                        </div>
                    </div>`;
            }
        });
    }
    
    document.getElementById('drawer-total-price').innerText = "₹" + grandTotal;
    drawer.style.display = "flex";
}

function closeCartDrawer(event) {
    if (!event || event.target === document.getElementById('cartDrawer') || event.target.tagName === 'BUTTON') {
        document.getElementById('cartDrawer').style.display = "none";
    }
}

// WhatsApp Link Generator Pipeline
function checkoutToWhatsApp() {
    const uniqueKeys = Object.keys(shoppingCart);
    if (uniqueKeys.length === 0) return;
    
    let message = "*New Order Details - Jeevan Jewellery*\n\n";
    let grandTotal = 0;
    
    uniqueKeys.forEach((key, index) => {
        const prod = products.find(p => p.dbKey === key);
        if (prod) {
            const qty = shoppingCart[key];
            const price = parseFloat(String(prod.price || '0').replace(/[^0-9.]/g, '')) || 0;
            const subtotal = price * qty;
            grandTotal += subtotal;
            message += `${index + 1}. *${prod.name}* (${prod.code || 'N/A'})\n`;
            message += `   Qty: ${qty} x ₹${price} = *₹${subtotal}*\n\n`;
        }
    });
    
    message += `---------------------------\n`;
    message += `*Grand Total: ₹${grandTotal}*`;
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`, '_blank');
}

// Input filter to sanitize non-numerical inputs for Admin Prices
function formatCurrencyInput(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    input.value = value ? '₹' + value : '';
}

// Open modal and load lossless HD images
function openDetailsModal(dbKey) {
    const prod = products.find(p => p.dbKey === dbKey);
    if (!prod) return;

    document.getElementById('details-code').innerText = prod.code || '';
    document.getElementById('details-title').innerText = prod.name || '';
    document.getElementById('details-desc').innerText = prod.description || "No description provided.";
    
    let cleanPrice = parseFloat(String(prod.price || '0').replace(/[^0-9.]/g, '')) || 0;
    document.getElementById('details-price-block').innerHTML = `<span style="font-size:1.4rem; font-weight:bold;">₹${cleanPrice}</span>`;

    const hdImages = parseProductImage(prod.img, true);
    const mainImgNode = document.getElementById('details-main-img');
    mainImgNode.src = hdImages[0];
    
    // Configures details modal image view to interact with lightbox zoom overlay
    mainImgNode.style.cursor = "zoom-in";
    mainImgNode.onclick = function() { openLightbox(this.src); };

    const thumbsContainer = document.getElementById('details-thumbs');
    thumbsContainer.innerHTML = '';

    hdImages.forEach((imgUrl, index) => {
        thumbsContainer.innerHTML += `
            <img src="${imgUrl}" class="thumb-img ${index === 0 ? 'active' : ''}" onclick="switchDetailsHDImage('${imgUrl}', this)" onerror="this.style.display='none'">
        `;
    });

    document.getElementById('detailsModal').style.display = "flex";
}

function switchDetailsHDImage(url, element) {
    document.getElementById('details-main-img').src = url;
    document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
}

function closeDetailsModal(event) { 
    if (!event || event.target === document.getElementById('detailsModal') || event.target.tagName === 'BUTTON') {
        document.getElementById('detailsModal').style.display = "none"; 
    }
}

// Full-Screen Interactive Lightbox Controls
function openLightbox(imageSrc) {
    const lightbox = document.getElementById('lightboxOverlay');
    const lightboxImg = document.getElementById('lightbox-img');
    
    lightboxImg.src = imageSrc;
    lightbox.style.display = "flex";
    document.body.style.overflow = "hidden"; // Prevent background layer crawl
}

function closeLightbox(event) {
    if (!event || event.target === document.getElementById('lightboxOverlay') || event.target.classList.contains('lightbox-close-btn')) {
        document.getElementById('lightboxOverlay').style.display = "none";
        document.body.style.overflow = "auto";
    }
}

// Double Image Compression Pipeline
function handleImageUpload(event) {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvasHD = document.createElement('canvas');
                const ctxHD = canvasHD.getContext('2d');
                const MAX_HD_WIDTH = 1200; 
                let wHD = img.width; let hHD = img.height;
                if (wHD > MAX_HD_WIDTH) { hHD = Math.round((hHD * MAX_HD_WIDTH) / wHD); wHD = MAX_HD_WIDTH; }
                canvasHD.width = wHD; canvasHD.height = hHD;
                ctxHD.drawImage(img, 0, 0, wHD, hHD);
                const hdBase64 = canvasHD.toDataURL('image/jpeg', 0.92);

                const canvasThumb = document.createElement('canvas');
                const ctxThumb = canvasThumb.getContext('2d');
                const MAX_THUMB_WIDTH = 320; 
                let wT = img.width; let hT = img.height;
                if (wT > MAX_THUMB_WIDTH) { hT = Math.round((hT * MAX_THUMB_WIDTH) / wT); wT = MAX_THUMB_WIDTH; }
                canvasThumb.width = wT; canvasThumb.height = hT;
                ctxThumb.drawImage(img, 0, 0, wT, hT);
                const thumbBase64 = canvasThumb.toDataURL('image/jpeg', 0.5);

                uploadedImagesArray.push(thumbBase64 + '*' + hdBase64);
                renderAdminPreviews();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    event.target.value = ""; 
}

function removePreviewImage(index) {
    uploadedImagesArray.splice(index, 1);
    renderAdminPreviews();
}

function makePrimaryImage(index) {
    if (index <= 0 || index >= uploadedImagesArray.length) return;
    const selectedItem = uploadedImagesArray.splice(index, 1)[0];
    uploadedImagesArray.unshift(selectedItem);
    renderAdminPreviews();
}

function renderAdminPreviews() {
    const wrapper = document.getElementById('admin-preview-wrapper');
    wrapper.innerHTML = '';
    
    uploadedImagesArray = uploadedImagesArray.filter(img => img && img.trim().length > 15);

    uploadedImagesArray.forEach((combinedString, index) => {
        const isMain = index === 0;
        const displayImg = combinedString.includes('*') ? combinedString.split('*')[0] : combinedString;

        const badgeHTML = isMain 
            ? `<span class="main-badge-indicator" style="position:absolute; bottom:2px; left:2px; font-size:10px; background:rgba(22,163,74,0.9); color:white; padding:2px 4px; border-radius:3px;">Main Card Cover</span>`
            : `<span class="set-main-star-btn" onclick="makePrimaryImage(${index})" style="position:absolute; bottom:2px; left:2px; font-size:14px; background:rgba(255,255,255,0.9); cursor:pointer; padding:1px 4px; border-radius:3px; border:1px solid #ccc;">⭐ Set Main</span>`;

        wrapper.innerHTML += `
            <div class="thumb-preview-container" style="position:relative; display:inline-block; margin:5px; border:${isMain ? '2px solid #16a34a' : '1px solid #ccc'}; border-radius:4px; padding:2px;">
                <img src="${displayImg}" style="width:75px; height:75px; object-fit:cover;">
                <span class="remove-thumb-btn" onclick="removePreviewImage(${index})" style="position:absolute; top:2px; right:2px; background:rgba(220,38,38,0.8); color:white; border-radius:50%; width:16px; height:16px; text-align:center; font-size:11px; line-height:16px; cursor:pointer;">✕</span>
                ${badgeHTML}
            </div>`;
    });
}

function openAdminPopup() { clearForm(); document.getElementById('adminModal').style.display = "flex"; }
function closeAdminPopup() { document.getElementById('adminModal').style.display = "none"; }

function saveProduct(e) {
    e.preventDefault();
    const dbKey = document.getElementById('product-id').value;
    const name = document.getElementById('prod-name').value;
    const price = document.getElementById('prod-price').value;
    const mrp = document.getElementById('prod-mrp').value;
    const stock = document.getElementById('prod-stock').value || "1";
    const description = document.getElementById('prod-desc').value || "";
    let code = document.getElementById('prod-code').value.trim();
    const status = document.getElementById('prod-status').value;

    uploadedImagesArray = uploadedImagesArray.filter(img => img && img.trim().length > 15);
    if (uploadedImagesArray.length === 0) { alert("Please add an image."); return; }
    if (!code) code = "PRD-" + Math.floor(1000 + Math.random() * 9000);

    const userPass = prompt("Enter Password:");
    if (!userPass) return;

    const imgPayloadString = uploadedImagesArray.join('|');
    const productPayload = { code, name, price, mrp, stock, description, img: imgPayloadString, status, updatedTime: Date.now() };

    database.ref('admin_pass').once('value').then((snapshot) => {
        if (snapshot.val() === userPass) {
            const refPath = dbKey ? 'products/' + dbKey : 'products';
            const operation = dbKey ? database.ref(refPath).set(productPayload) : database.ref(refPath).push(productPayload);
            operation.then(() => { closeAdminPopup(); alert("Saved successfully!"); });
        } else {
            alert("Wrong password!");
        }
    });
}

function editProduct(dbKey) {
    const prod = products.find(p => p.dbKey === dbKey);
    if (!prod) return;
    
    document.getElementById('product-id').value = prod.dbKey;
    document.getElementById('prod-code').value = prod.code || '';
    document.getElementById('prod-name').value = prod.name || '';
    document.getElementById('prod-price').value = prod.price || '';
    document.getElementById('prod-mrp').value = prod.mrp || '';
    document.getElementById('prod-stock').value = prod.stock || "1";
    document.getElementById('prod-desc').value = prod.description || '';
    document.getElementById('prod-status').value = prod.status;
    
    if (prod.img && !prod.img.includes('*') && prod.img.length > 50) {
        let oldImages = prod.img.split(prod.img.includes('|') ? '|' : ',');
        uploadedImagesArray = oldImages.map(img => img.trim() + '*' + img.trim());
    } else {
        uploadedImagesArray = prod.img ? prod.img.split('|') : [];
    }
    
    renderAdminPreviews();
    document.getElementById('form-title').innerText = "Edit Product";
    document.getElementById('adminModal').style.display = "flex";
}

function deleteProduct(dbKey) {
    if (confirm("Delete permanently?")) {
        const userPass = prompt("Enter Password:");
        database.ref('admin_pass').once('value').then((snapshot) => {
            if (snapshot.val() === userPass) { database.ref('products/' + dbKey).remove(); }
            else { alert("Wrong password!"); }
        });
    }
}

function clearForm() {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = "";
    uploadedImagesArray = [];
    document.getElementById('admin-preview-wrapper').innerHTML = '';
}

// Fallback listener initialization for the sort toggle label setup
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('sort-toggle-btn');
    if (btn) {
        btn.innerHTML = "Sort Price ↕️";
        btn.style.backgroundColor = "#e2e8f0";
        btn.style.color = "#475569";
    }
});


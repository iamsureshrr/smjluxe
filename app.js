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
let categories = [];
let storeSettings = { name: "SMJ Luxe", logo: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='14' fill='%23dfe7df'/><text x='60' y='68' text-anchor='middle' font-size='32' fill='%23b8865b' font-family='serif'>SMJ</text></svg>" };
let shoppingCart = {}; 
let isAdmin = false;
let selectedCategoryFilter = "In Stock"; 
let selectedProductCategoryKey = null;
const WHATSAPP_NUMBER = "919342721847";

let uploadedImagesArray = []; // Holds items structured as "thumbnailData*hdData"
let categoryImageData = "";
let currentSortState = "manual"; // Options: "manual", "lowToHigh", "highToLow"
let currentEditingProductKey = "";
let selectedProductDisplayOrder = 0;
let storeLogoData = "";
let gpayQrData = "";
let contactIconData = {};
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxScale = 1;
let lightboxStartX = 0;
let lightboxLastDistance = 0;

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('manage') === 'true') {
    isAdmin = true;
    selectedCategoryFilter = "All";
    document.getElementById('store-settings-btn').style.display = "inline-flex";
    document.getElementById('manage-cat-btn').style.display = "inline-flex";
    document.getElementById('add-prod-btn').style.display = "inline-flex";
    document.getElementById('store-title').innerText = "Jeevan Jewellery Admin";
    document.getElementById('chip-All').classList.add('active');
} else {
    document.getElementById('chip-InStock').classList.add('active');
}

// Fetch editable store settings
database.ref('store_settings').on('value', (snapshot) => {
    const data = snapshot.val() || {};
    storeSettings = { ...storeSettings, ...data, name: data.name || storeSettings.name || 'SMJ Luxe', logo: data.logo || storeSettings.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='14' fill='%23dfe7df'/><text x='60' y='68' text-anchor='middle' font-size='32' fill='%23b8865b' font-family='serif'>SMJ</text></svg>" };
    applyStoreSettings(); refreshQuickContactIcons();
}, (error) => { console.error(error); });

// ✅ ADD THIS BLOCK
let lastKey = null;
const pageSize = 10;
let isLoading = false;

function loadProductsBatch() {
  if (isLoading) return;
  isLoading = true;

  let query = database.ref("products").orderByKey().limitToFirst(pageSize);
  if (lastKey) {
    query = database.ref("products").orderByKey().startAfter(lastKey).limitToFirst(pageSize);
  }

  query.once("value").then(snapshot => {
    const data = snapshot.val();
    if (!data) {
      document.getElementById('sentinel').style.display = 'none';
      observer.disconnect();
      return;
    }

    Object.keys(data).forEach(key => {
      const product = { dbKey: key, ...data[key] };
      products.push(product); // add to global products array
    });

    // Use your existing rendering logic
    filterStore();

    lastKey = Object.keys(data).pop();
    isLoading = false;
  });
}

// Intersection Observer
const sentinel = document.getElementById('sentinel');
const observer = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    loadProductsBatch();
  }
});
observer.observe(sentinel);

// Load first batch immediately
loadProductsBatch();

// Fetch database records
//database.ref('products').on('value', (snapshot) => {
 //   document.getElementById('loading-indicator').style.display = 'none';
  //  const data = snapshot.val();
   // products = [];
    //if (data) {
     //   Object.keys(data).forEach(key => {
      //      products.push({ dbKey: key, ...data[key] });
     //   });
  //  }
//    renderCategories();
 //   filterStore();
//}, (error) => {
//    console.error(error);
//});

// Fetch admin-created shop categories
database.ref('categories').on('value', (snapshot) => {
    const data = snapshot.val();
    categories = [];
    if (data) {
        Object.keys(data).forEach(key => {
            categories.push({ dbKey: key, ...data[key] });
        });
    }
    categories.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    renderCategories();
    populateCategoryDropdown();
    if (selectedProductCategoryKey) filterStore();
}, (error) => {
    console.error(error);
});

// Separates the fast preview element from high resolution source packages cleanly
function normalizeProductImagePayload(imgStr) {
    let value = String(imgStr || '').trim();
    if (!value) return '';

    // Repairs records accidentally split at the comma inside a base64 data URL.
    value = value.replace(/(data:image\/[^;]+;base64)\*data:image\/[^;]+;base64\|([A-Za-z0-9+/=]+)\*\2/g, '$1,$2*$1,$2');
    value = value.replace(/(data:image\/[^;]+;base64)\|([A-Za-z0-9+/=]+)/g, '$1,$2');
    return value;
}

function parseProductImage(imgStr, getHD = false) {
    const fallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='M21 15l-5-5L5 21'/></svg>";
    const normalized = normalizeProductImagePayload(imgStr);
    if (!normalized || normalized === "Local Image Loaded") return [fallback];

    const parsedImages = normalized.split('|').map(entry => {
        const cleanEntry = entry.trim();
        if (cleanEntry.includes('*')) {
            const parts = cleanEntry.split('*');
            return getHD ? parts[1] : parts[0];
        }
        return cleanEntry;
    }).filter(str => str && (str.startsWith('data:image/') || str.startsWith('http') || str.length > 30));

    return parsedImages.length ? parsedImages : [fallback];
}

function applyStoreSettings() {
    const name = storeSettings.name || 'SMJ Luxe';
    const logo = storeSettings.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='14' fill='%23dfe7df'/><text x='60' y='68' text-anchor='middle' font-size='32' fill='%23b8865b' font-family='serif'>SMJ</text></svg>";
    document.getElementById('store-title').innerText = isAdmin ? name + ' Admin' : name;
    document.title = name;
    const logoNode = document.getElementById('brand-logo');
    if (logoNode) logoNode.src = logo;
}

function handleStoreLogoUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const size = 260;
            canvas.width = size; canvas.height = size;
            const side = Math.min(img.width, img.height);
            const sx = Math.round((img.width - side) / 2);
            const sy = Math.round((img.height - side) / 2);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
            storeLogoData = canvas.toDataURL('image/jpeg', 0.82);
            renderStoreLogoPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file); event.target.value = '';
}

function renderStoreLogoPreview() {
    const preview = document.getElementById('settings-logo-preview');
    if (!preview) return;
    const logo = storeLogoData || storeSettings.logo || '';
    if (logo) { preview.src = logo; preview.style.display = 'block'; }
    else { preview.removeAttribute('src'); preview.style.display = 'none'; }
}

function openStoreSettingsPopup() {
    storeLogoData = '';
    document.getElementById('settings-store-name').value = storeSettings.name || '';
    document.getElementById('settings-whatsapp-number').value = storeSettings.whatsapp || '';
    document.getElementById('settings-call-number').value = storeSettings.call || '';
    document.getElementById('settings-map-link').value = storeSettings.mapLink || '';
    gpayQrData = '';
    contactIconData = {};
    renderStoreLogoPreview();
    renderGpayPreview();
    document.getElementById('storeSettingsModal').style.display = 'flex';
}
function closeStoreSettingsPopup() { document.getElementById('storeSettingsModal').style.display = 'none'; }

function saveStoreSettings(e) {
    e.preventDefault();
    const name = document.getElementById('settings-store-name').value.trim();
    if (!name) return;
    const userPass = prompt('Enter Password:');
    if (!userPass) return;
    const payload = { name, logo: storeLogoData || storeSettings.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' rx='14' fill='%23dfe7df'/><text x='60' y='68' text-anchor='middle' font-size='32' fill='%23b8865b' font-family='serif'>SMJ</text></svg>", whatsapp: document.getElementById('settings-whatsapp-number').value.trim(), call: document.getElementById('settings-call-number').value.trim(), mapLink: document.getElementById('settings-map-link').value.trim(), gpayQr: gpayQrData || storeSettings.gpayQr || '', whatsappIcon: contactIconData.whatsappIcon || storeSettings.whatsappIcon || '', callIcon: contactIconData.callIcon || storeSettings.callIcon || '', gpayIcon: contactIconData.gpayIcon || storeSettings.gpayIcon || '', mapIcon: contactIconData.mapIcon || storeSettings.mapIcon || '', updatedTime: Date.now() };
    database.ref('admin_pass').once('value').then((snapshot) => {
        if (snapshot.val() === userPass) {
            database.ref('store_settings').set(payload).then(() => { closeStoreSettingsPopup(); alert('Store settings saved!'); }).catch(() => alert('Firebase permission denied for store settings. Please add store_settings write permission in rules.'));
        } else { alert('Wrong password!'); }
    });
}

function handleContactIconUpload(event, key) {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = e => { contactIconData[key] = e.target.result; };
    reader.readAsDataURL(file); event.target.value = '';
}
function getContactIcon(key, fallback) { return storeSettings[key] || fallback; }
function quickButtonHTML(iconKey, fallback, label) {
    const icon = storeSettings[iconKey] || fallback || '';
    const hasImage = icon && (icon.startsWith('data:image/') || icon.startsWith('http'));
    return (hasImage ? '<img src="' + icon + '" alt=""> ' : '') + '<span>' + label + '</span>';
}
function refreshQuickContactIcons() {
    const menu = document.getElementById('quickContactMenu'); if (!menu) return;
    const buttons = menu.querySelectorAll('button');
    if (buttons[0]) buttons[0].innerHTML = quickButtonHTML('whatsappIcon', 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg', 'WhatsApp');
    if (buttons[1]) buttons[1].innerHTML = quickButtonHTML('callIcon', '', 'Call');
    if (buttons[2]) buttons[2].innerHTML = quickButtonHTML('gpayIcon', '', 'GPay');
    if (buttons[3]) buttons[3].innerHTML = quickButtonHTML('mapIcon', '', 'Map');
}

function handleGpayQrUpload(event) {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = e => { gpayQrData = e.target.result; renderGpayPreview(); };
    reader.readAsDataURL(file); event.target.value = '';
}
function renderGpayPreview() { const img = document.getElementById('settings-gpay-preview'); if (!img) return; const src = gpayQrData || storeSettings.gpayQr || ''; if (src) { img.src = src; img.style.display='block'; } else { img.style.display='none'; } }
function toggleQuickContact(event) { event.stopPropagation(); const menu = document.getElementById('quickContactMenu'); const main = document.querySelector('.quick-main'); menu.classList.toggle('open'); if (main) main.classList.toggle('open', menu.classList.contains('open')); refreshQuickContactIcons(); }
function openWhatsAppContact(event) { event.stopPropagation(); const n = String(storeSettings.whatsapp || '').replace(/[^0-9]/g,''); if (n) window.open('https://wa.me/' + n + '?text=Hi', '_blank'); }
function openCallContact(event) { event.stopPropagation(); const n = String(storeSettings.call || '').replace(/[^0-9+]/g,''); if (n) window.location.href = 'tel:' + n; }
function openMapLink(event) { event.stopPropagation(); if (storeSettings.mapLink) window.open(storeSettings.mapLink, '_blank'); }
function openGpayQr(event) { event.stopPropagation(); if (!storeSettings.gpayQr) return alert('GPay QR not added.'); document.getElementById('gpay-qr-img').src = storeSettings.gpayQr; document.getElementById('gpayModal').style.display = 'flex'; }
function closeGpayQr(event) { if (!event || event.target === document.getElementById('gpayModal')) document.getElementById('gpayModal').style.display = 'none'; }

document.addEventListener('click', () => { const menu = document.getElementById('quickContactMenu'); const main = document.querySelector('.quick-main'); if (menu) menu.classList.remove('open'); if (main) main.classList.remove('open'); });

function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function getFallbackImage() {
    return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180' viewBox='0 0 300 180'><rect width='300' height='180' fill='%23e2e8f0'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='Arial' font-size='18'>SMJ Luxe</text></svg>";
}

function getCategoryOrder(category) { return parseInt(category.displayOrder || 0, 10) || 0; }
function sortCategoriesForHome(items) {
    items.sort((a, b) => {
        const oa = getCategoryOrder(a), ob = getCategoryOrder(b);
        if (oa === 0 && ob !== 0) return 1;
        if (oa !== 0 && ob === 0) return -1;
        if (oa !== ob) return oa - ob;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}
function populateCategoryOrderDropdown(selectedValue = 0) {
    const select = document.getElementById('category-display-order'); if (!select) return;
    const currentId = document.getElementById('category-id').value;
    const currentValue = parseInt(selectedValue || 0, 10) || 0;
    const used = new Set(categories.filter(c => c.dbKey !== currentId).map(c => parseInt(c.displayOrder || 0, 10)).filter(n => n > 0));
    const max = categories.filter(c => c.dbKey !== currentId).length + 1;
    select.innerHTML = '<option value="0">0 - Bottom</option>';
    for (let i = 1; i <= max; i++) if (!used.has(i) || i === currentValue) select.innerHTML += '<option value="' + i + '" ' + (i === currentValue ? 'selected' : '') + '>' + i + '</option>';
    if (currentValue === 0) select.value = '0';
}

function getCategoryProductCount(categoryKey) {
    if (categoryKey === "__all__") return products.length;
    if (categoryKey === "__uncategorized__") return products.filter(p => !p.categoryKey).length;
    return products.filter(p => p.categoryKey === categoryKey).length;
}

function renderCategories() {
    const container = document.getElementById('categories-container');
    if (!container) return;

    container.innerHTML = '';
    const cards = [...categories];
    sortCategoriesForHome(cards);

    if (isAdmin) {
        cards.unshift({ dbKey: "__all__", name: "All Products", img: getFallbackImage(), isSystem: true });
        if (products.some(p => !p.categoryKey)) {
            cards.push({ dbKey: "__uncategorized__", name: "Uncategorized", img: getFallbackImage(), isSystem: true });
        }
    }

    if (cards.length === 0) {
        container.innerHTML = isAdmin
            ? '<div class="loading" style="grid-column: span 2;">No categories yet. Tap Add Category to create one.</div>'
            : '<div class="loading" style="grid-column: span 2;">No categories available yet.</div>';
        return;
    }

    cards.forEach(category => {
        const count = getCategoryProductCount(category.dbKey);
        const imgSrc = category.img || getFallbackImage();
        const safeName = escapeHTML(category.name || 'Category');
        const adminActions = isAdmin && !category.isSystem
            ? '<div class="category-admin-actions" onclick="event.stopPropagation();"><button class="btn btn-secondary" type="button" onclick="event.stopPropagation(); editCategory(\'' + category.dbKey + '\')">Edit</button><button class="btn btn-danger" type="button" onclick="deleteCategory(\'' + category.dbKey + '\')">Delete</button></div>'
            : '';
        container.innerHTML +=             '<div class="category-card" onclick="openProductCategory(\'' + category.dbKey + '\')">' +
                '<img src="' + imgSrc + '" class="category-card-img" alt="' + safeName + '">' +
                '<div class="category-card-info">' +
                    '<span class="category-card-name">' + safeName + '</span>' +
                    '<span class="category-card-count">' + count + '</span>' +
                '</div>' +
                adminActions +
            '</div>';
    });

    renderAdminCategoryList();
}

function openProductCategory(categoryKey) {
    selectedProductCategoryKey = categoryKey;
    currentSortState = getCategoryDefaultSort(categoryKey);
    const category = categories.find(c => c.dbKey === categoryKey);
    let title = category ? category.name : "Products";
    if (categoryKey === "__all__") title = "All Products";
    if (categoryKey === "__uncategorized__") title = "Uncategorized";

    document.getElementById('selected-category-title').innerText = title;
    document.getElementById('category-home-section').style.display = "none";
    document.getElementById('products-section').style.display = "block";
    updateSortButton();
    filterStore();
}

function showCategoryHome() {
    selectedProductCategoryKey = null;
    document.getElementById('products-section').style.display = "none";
    document.getElementById('category-home-section').style.display = "block";
    document.getElementById('search-box').value = "";
}

function populateCategoryDropdown(selectedKey = "__uncategorized__") {
    const select = document.getElementById('prod-category');
    if (!select) return;

    const activeKey = selectedKey || "__uncategorized__";
    const uncategorizedSelected = activeKey === "__uncategorized__" ? "selected" : "";
    select.innerHTML = `<option value="__uncategorized__" ${uncategorizedSelected}>Uncategorized</option>`;
    categories.forEach(category => {
        const selected = category.dbKey === activeKey ? 'selected' : '';
        select.innerHTML += `<option value="${category.dbKey}" ${selected}>${escapeHTML(category.name || 'Category')}</option>`;
    });
}

function getOrderCategoryKey() {
    const select = document.getElementById('prod-category');
    const key = select ? select.value : '__uncategorized__';
    return key === '__uncategorized__' ? '' : key;
}
function getProductsForDisplayOrder(categoryKey) { return products.filter(p => (p.categoryKey || '') === categoryKey && p.dbKey !== currentEditingProductKey); }
function populateDisplayOrderDropdown(selectedValue) {
    const select = document.getElementById('prod-display-order'); if (!select) return;
    const currentValue = parseInt((selectedValue === undefined ? selectedProductDisplayOrder : selectedValue) || 0, 10) || 0;
    const categoryKey = getOrderCategoryKey();
    const used = new Set(getProductsForDisplayOrder(categoryKey).map(p => parseInt(p.displayOrder || 0, 10)).filter(n => n > 0));
    const max = getProductsForDisplayOrder(categoryKey).length + 1;
    select.innerHTML = '<option value="0">0 - Bottom</option>';
    for (let i = 1; i <= max; i++) {
        if (!used.has(i) || i === currentValue) select.innerHTML += '<option value="' + i + '" ' + (i === currentValue ? 'selected' : '') + '>' + i + '</option>';
    }
    if (currentValue === 0) select.value = '0';
}
function movePreviewImage(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= uploadedImagesArray.length) return;
    const item = uploadedImagesArray[index]; uploadedImagesArray[index] = uploadedImagesArray[targetIndex]; uploadedImagesArray[targetIndex] = item;
    renderAdminPreviews();
}

function handleCategoryImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 700;
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            categoryImageData = canvas.toDataURL('image/jpeg', 0.72);
            renderCategoryPreview();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
}

function renderCategoryPreview() {
    const preview = document.getElementById('category-preview-img');
    if (!preview) return;
    if (categoryImageData) {
        preview.src = categoryImageData;
        preview.style.display = "block";
    } else {
        preview.removeAttribute('src');
        preview.style.display = "none";
    }
}

function openCategoryPopup() {
    clearCategoryForm();
    populateCategoryOrderDropdown(0);
    renderAdminCategoryList();
    document.getElementById('categoryModal').style.display = "flex";
}

function closeCategoryPopup() {
    document.getElementById('categoryModal').style.display = "none";
}

function clearCategoryForm() {
    const form = document.getElementById('category-form');
    if (form) form.reset();
    document.getElementById('category-id').value = "";
    document.getElementById('category-form-title').innerText = "Add Category";
    document.getElementById('category-default-sort').value = 'manual';
    populateCategoryOrderDropdown(0);
    categoryImageData = "";
    renderCategoryPreview();
}

function saveCategory(e) {
    e.preventDefault();
    const dbKey = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value.trim();
    if (!name) return;
    if (!categoryImageData) { alert("Please add a category image."); return; }

    const userPass = prompt("Enter Password:");
    if (!userPass) return;

    const defaultSort = document.getElementById('category-default-sort').value || 'manual';
    const displayOrder = parseInt(document.getElementById('category-display-order').value || '0', 10) || 0;
    const payload = { name, img: categoryImageData, defaultSort, displayOrder, updatedTime: Date.now() };
    database.ref('admin_pass').once('value').then((snapshot) => {
        if (snapshot.val() === userPass) {
            const refPath = dbKey ? 'categories/' + dbKey : 'categories';
            const operation = dbKey ? database.ref(refPath).set(payload) : database.ref(refPath).push(payload);
            operation.then(() => { clearCategoryForm(); alert("Category saved successfully!"); }).catch(() => { alert("Firebase permission denied for categories. Please add categories write permission in Realtime Database rules."); });
        } else {
            alert("Wrong password!");
        }
    });
}

function editCategory(dbKey) {
    const category = categories.find(c => c.dbKey === dbKey);
    if (!category) return;
    document.getElementById('category-id').value = category.dbKey;
    document.getElementById('category-name').value = category.name || "";
    document.getElementById('category-form-title').innerText = "Edit Category";
    document.getElementById('category-default-sort').value = category.defaultSort || 'manual';
    populateCategoryOrderDropdown(category.displayOrder || 0);
    categoryImageData = category.img || "";
    renderCategoryPreview();
    document.getElementById('categoryModal').style.display = "flex";
}

function deleteCategory(dbKey) {
    if (!confirm("Delete this category? Products will become uncategorized.")) return;
    const userPass = prompt("Enter Password:");
    if (!userPass) return;

    database.ref('admin_pass').once('value').then((snapshot) => {
        if (snapshot.val() === userPass) {
            database.ref('categories/' + dbKey).remove().then(() => {
                products.filter(p => p.categoryKey === dbKey).forEach(product => {
                    database.ref('products/' + product.dbKey).update({ categoryKey: "", categoryName: "" });
                });
            });
        } else {
            alert("Wrong password!");
        }
    });
}

function renderAdminCategoryList() {
    const list = document.getElementById('admin-categories-list');
    if (!list || !isAdmin) return;
    if (categories.length === 0) {
        list.innerHTML = '<div class="loading" style="padding:0.5rem;">No saved categories yet.</div>';
        return;
    }

    list.innerHTML = '<div style="font-weight:bold; font-size:0.85rem; color:#475569;">Saved Categories</div>';
    categories.forEach(category => {
        list.innerHTML += `
            <div class="admin-category-row">
                <span class="admin-category-name">${escapeHTML(category.name || 'Category')}</span>
                <div class="admin-category-actions">
                    <button class="btn btn-secondary" type="button" onclick="editCategory('${category.dbKey}')">Edit</button>
                    <button class="btn btn-danger" type="button" onclick="deleteCategory('${category.dbKey}')">Delete</button>
                </div>
            </div>`;
    });
}

function getCategoryDefaultSort(categoryKey) { const category = categories.find(c => c.dbKey === categoryKey); return category && category.defaultSort ? category.defaultSort : 'manual'; }
function getPriceNumber(product) { return parseFloat(String(product.price || '0').replace(/[^0-9.]/g, '')) || 0; }
function getProductOrder(product) { return parseInt(product.displayOrder || 0, 10) || 0; }
function sortProductsForCurrentMode(items) {
    if (currentSortState === 'lowToHigh') items.sort((a,b) => getPriceNumber(a) - getPriceNumber(b) || String(a.name || '').localeCompare(String(b.name || '')));
    else if (currentSortState === 'highToLow') items.sort((a,b) => getPriceNumber(b) - getPriceNumber(a) || String(a.name || '').localeCompare(String(b.name || '')));
    else items.sort((a,b) => { const oa = getProductOrder(a); const ob = getProductOrder(b); if (oa === 0 && ob !== 0) return 1; if (oa !== 0 && ob === 0) return -1; if (oa !== ob) return oa - ob; return (b.updatedTime || 0) - (a.updatedTime || 0); });
}
function updateSortButton() {
    const btn = document.getElementById('sort-toggle-btn'); if (!btn) return;
    if (currentSortState === 'lowToHigh') btn.innerHTML = 'Price: Low to High'; else if (currentSortState === 'highToLow') btn.innerHTML = 'Price: High to Low'; else btn.innerHTML = 'Featured';
    const active = currentSortState !== 'manual'; btn.style.backgroundColor = active ? 'var(--primary)' : '#e2e8f0'; btn.style.color = active ? 'white' : '#475569';
}
function toggleSortMode() { if (currentSortState === 'manual') currentSortState = 'lowToHigh'; else if (currentSortState === 'lowToHigh') currentSortState = 'highToLow'; else currentSortState = 'manual'; updateSortButton(); filterStore(); }

function filterStore() {
    const searchQuery = document.getElementById('search-box').value.toLowerCase().trim();
    const container = document.getElementById('products-container');
    container.innerHTML = '';

    // Filter logic
    let filtered = products.filter(p => {
        if (selectedProductCategoryKey === "__uncategorized__" && p.categoryKey) return false;
        if (selectedProductCategoryKey && selectedProductCategoryKey !== "__all__" && selectedProductCategoryKey !== "__uncategorized__" && p.categoryKey !== selectedProductCategoryKey) return false;
        if (selectedCategoryFilter !== "All" && p.status !== selectedCategoryFilter) return false;
        const matchesName = p.name ? p.name.toLowerCase().includes(searchQuery) : false;
        const matchesCode = p.code ? p.code.toLowerCase().includes(searchQuery) : false;
        return searchQuery === "" || matchesName || matchesCode;
    });
    sortProductsForCurrentMode(filtered);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading" style="grid-column: span 2;">No products found.</div>';
        return;
    }

    // Loops and mounts every single matched inventory data record systematically
    filtered.forEach(product => {
        let overlayHTML = '';
        let displayPriceHTML = `<div class="product-price">&#8377;${parseFloat(String(product.price || '0').replace(/[^0-9.]/g, '')) || 0}</div>`;
        let buttonHTML = '';
        let discountBadgeHTML = '';

        if (product.mrp && product.price && product.status !== "Coming Soon") {
            let numMRP = parseFloat(String(product.mrp).replace(/[^0-9.]/g, '')) || 0;
            let numPrice = parseFloat(String(product.price).replace(/[^0-9.]/g, '')) || 0;
            if (numMRP > numPrice) {
                let pct = Math.round(((numMRP - numPrice) / numMRP) * 100);
                if (pct > 0) discountBadgeHTML = `<div class="discount-badge">${pct}% OFF</div>`;
                displayPriceHTML = `<div class="product-price">&#8377;${numPrice}</div><div class="product-mrp-crossed">&#8377;${numMRP}</div>`;
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
    const prod = products.find(p => p.dbKey === dbKey); if (!prod) return;
    document.getElementById('details-code').innerText = prod.code || '';
    document.getElementById('details-title').innerText = prod.name || '';
    document.getElementById('details-desc').innerText = prod.description || 'No description provided.';
    let cleanPrice = parseFloat(String(prod.price || '0').replace(/[^0-9.]/g, '')) || 0;
    document.getElementById('details-price-block').innerHTML = '<span style="font-size:1.4rem; font-weight:bold;">&#8377;' + cleanPrice + '</span>';
    const hdImages = parseProductImage(prod.img, true);
    const mainImgNode = document.getElementById('details-main-img'); mainImgNode.src = hdImages[0]; mainImgNode.style.cursor = 'zoom-in';
    mainImgNode.onclick = function() { openLightbox(hdImages, Math.max(0, hdImages.indexOf(this.src))); };
    let touchStartX = 0;
    mainImgNode.ontouchstart = function(event) { touchStartX = event.touches[0].clientX; };
    mainImgNode.ontouchend = function(event) { const delta = event.changedTouches[0].clientX - touchStartX; if (Math.abs(delta) > 45 && hdImages.length > 1) { const currentIndex = Math.max(0, hdImages.indexOf(mainImgNode.src)); const wrappedIndex = (currentIndex + (delta < 0 ? 1 : -1) + hdImages.length) % hdImages.length; switchDetailsHDImage(hdImages[wrappedIndex], document.querySelectorAll('.thumb-img')[wrappedIndex]); } };
    const thumbsContainer = document.getElementById('details-thumbs'); thumbsContainer.innerHTML = '';
    hdImages.forEach((imgUrl, index) => { thumbsContainer.innerHTML += '<img src="' + imgUrl + '" class="thumb-img ' + (index === 0 ? 'active' : '') + '" onclick="switchDetailsHDImage(\'' + imgUrl + '\', this)" onerror="this.style.display=\'none\'">'; });
    document.getElementById('detailsModal').style.display = 'flex';
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
function openLightbox(imagesOrSrc, startIndex = 0) {
    lightboxImages = Array.isArray(imagesOrSrc) ? imagesOrSrc : [imagesOrSrc]; lightboxIndex = Math.max(0, startIndex || 0); lightboxScale = 1;
    const lightbox = document.getElementById('lightboxOverlay'); const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = lightboxImages[lightboxIndex]; lightboxImg.style.transform = 'scale(1)'; lightbox.style.display = 'flex'; document.body.style.overflow = 'hidden';
}
function renderLightboxImage() { const img = document.getElementById('lightbox-img'); img.src = lightboxImages[lightboxIndex]; lightboxScale = 1; img.style.transform = 'scale(1)'; }
function navigateLightbox(event, direction) { if (event) event.stopPropagation(); if (!lightboxImages.length) return; lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length; renderLightboxImage(); }
function downloadLightboxImage(event) { if (event) event.stopPropagation(); const src = lightboxImages[lightboxIndex]; if (!src) return; const link = document.createElement('a'); link.href = src; link.download = 'smj-product-image.jpg'; document.body.appendChild(link); link.click(); link.remove(); }

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
                const MAX_HD_WIDTH = 2400; 
                let wHD = img.width; let hHD = img.height;
                if (wHD > MAX_HD_WIDTH) { hHD = Math.round((hHD * MAX_HD_WIDTH) / wHD); wHD = MAX_HD_WIDTH; }
                canvasHD.width = wHD; canvasHD.height = hHD;
                ctxHD.drawImage(img, 0, 0, wHD, hHD);
                const hdBase64 = canvasHD.toDataURL('image/jpeg', 0.98);

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
            : `<span class="set-main-star-btn" onclick="makePrimaryImage(${index})" style="position:absolute; bottom:2px; left:2px; font-size:14px; background:rgba(255,255,255,0.9); cursor:pointer; padding:1px 4px; border-radius:3px; border:1px solid #ccc;">Set Main</span>`;

        wrapper.innerHTML += `
            <div class="thumb-preview-container" style="position:relative; display:inline-block; margin:5px; border:${isMain ? '2px solid #16a34a' : '1px solid #ccc'}; border-radius:4px; padding:2px;">
                <img src="${displayImg}" style="width:75px; height:75px; object-fit:cover;">
                <button class="remove-thumb-btn" type="button" aria-label="Remove image" onclick="removePreviewImage(${index})">&times;</button>
                ${badgeHTML}
                <div class="display-order-controls">
                    <button type="button" onclick="movePreviewImage(${index}, -1)">Left</button>
                    <button type="button" onclick="movePreviewImage(${index}, 1)">Right</button>
                </div>
            </div>`;
    });
}

function openAdminPopup() { clearForm(); populateCategoryDropdown(selectedProductCategoryKey && !selectedProductCategoryKey.startsWith("__") ? selectedProductCategoryKey : "__uncategorized__"); populateDisplayOrderDropdown(); document.getElementById('adminModal').style.display = "flex"; }
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
    const displayOrder = parseInt(document.getElementById('prod-display-order').value || '0', 10) || 0;
    const categoryKey = document.getElementById('prod-category').value || "__uncategorized__";
    const selectedCategory = categoryKey === "__uncategorized__"
        ? { dbKey: "", name: "Uncategorized" }
        : categories.find(c => c.dbKey === categoryKey);

    if (!selectedCategory) { alert("Please select a product category."); return; }
    uploadedImagesArray = uploadedImagesArray.filter(img => img && img.trim().length > 15);
    if (uploadedImagesArray.length === 0) { alert("Please add an image."); return; }
    if (!code) code = "PRD-" + Math.floor(1000 + Math.random() * 9000);

    const userPass = prompt("Enter Password:");
    if (!userPass) return;

    const imgPayloadString = uploadedImagesArray.join('|');
    const savedCategoryKey = categoryKey === "__uncategorized__" ? "" : categoryKey;
    const savedCategoryName = categoryKey === "__uncategorized__" ? "" : (selectedCategory.name || "");
    const productPayload = { code, name, price, mrp, stock, description, img: imgPayloadString, status, categoryKey: savedCategoryKey, categoryName: savedCategoryName, displayOrder, updatedTime: Date.now() };

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
    selectedProductDisplayOrder = parseInt(prod.displayOrder || 0, 10) || 0;
    populateCategoryDropdown(prod.categoryKey || "__uncategorized__");
    populateDisplayOrderDropdown(selectedProductDisplayOrder);
    
    const normalizedImg = normalizeProductImagePayload(prod.img || '');
    if (normalizedImg && !normalizedImg.includes('*')) {
        const oldImages = normalizedImg.includes('|') ? normalizedImg.split('|') : [normalizedImg];
        uploadedImagesArray = oldImages.map(img => img.trim()).filter(Boolean).map(img => img + '*' + img);
    } else {
        uploadedImagesArray = normalizedImg ? normalizedImg.split('|') : [];
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
    document.getElementById('form-title').innerText = "Add Product";
    populateCategoryDropdown(selectedProductCategoryKey && !selectedProductCategoryKey.startsWith("__") ? selectedProductCategoryKey : "__uncategorized__");
    uploadedImagesArray = [];
    document.getElementById('admin-preview-wrapper').innerHTML = '';
    populateDisplayOrderDropdown();
}

// Fallback listener initialization for the sort toggle label setup
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById('sort-toggle-btn');
    if (btn) {
        btn.innerHTML = "Sort Price";
        btn.style.backgroundColor = "#e2e8f0";
        btn.style.color = "#475569";
    }
});







function getTouchDistance(touches) { const dx = touches[0].clientX - touches[1].clientX; const dy = touches[0].clientY - touches[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
document.addEventListener('DOMContentLoaded', () => {
    applyStoreSettings(); updateSortButton(); populateDisplayOrderDropdown();
    const lightbox = document.getElementById('lightboxOverlay'); const img = document.getElementById('lightbox-img'); if (!lightbox || !img) return;
    lightbox.addEventListener('wheel', (event) => { event.preventDefault(); lightboxScale += event.deltaY < 0 ? 0.15 : -0.15; lightboxScale = Math.min(4, Math.max(1, lightboxScale)); img.style.transform = 'scale(' + lightboxScale + ')'; }, { passive: false });
    lightbox.addEventListener('touchstart', (event) => { if (event.touches.length === 1) lightboxStartX = event.touches[0].clientX; if (event.touches.length === 2) lightboxLastDistance = getTouchDistance(event.touches); }, { passive: false });
    lightbox.addEventListener('touchmove', (event) => { if (event.touches.length === 2) { event.preventDefault(); const distance = getTouchDistance(event.touches); if (lightboxLastDistance) { lightboxScale += (distance - lightboxLastDistance) / 180; lightboxScale = Math.min(4, Math.max(1, lightboxScale)); img.style.transform = 'scale(' + lightboxScale + ')'; } lightboxLastDistance = distance; } }, { passive: false });
    lightbox.addEventListener('touchend', (event) => { if (event.changedTouches.length === 1 && event.touches.length === 0 && lightboxScale === 1) { const delta = event.changedTouches[0].clientX - lightboxStartX; if (Math.abs(delta) > 55) navigateLightbox(event, delta < 0 ? 1 : -1); } lightboxLastDistance = 0; });
});



import { Chart } from 'chart.js';
import { Database } from './js/database.js';
import { UIUtils } from './js/ui-utils.js';
import { POSManager } from './js/pos-manager.js';
import { translations } from './js/translations.js';

class SmartBillApp {
    constructor() {
        this.ui = new UIUtils();
        this.pos = new POSManager(this);

        this.lang = localStorage.getItem('smartbill_lang') || 'es';
        this.currentTicket = [];
        this.currentExplorerTable = 'inventory';
        this.chart = null;
        this.isExplorerLoggedIn = false;
        this.currentUser = null;

        this.initAsync();
    }

    async initAsync() {
        // Check if user is already logged in
        const savedUser = localStorage.getItem('smartbill_current_user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.db = await Database.load(`smartbill_pro_db_${this.currentUser.username}`);
            // Hide login and show app
            document.getElementById('login-wrapper').style.display = 'none';
        } else {
            this.db = await Database.load();
        }
        this.init();
    }

    // removed loadDB() { ... }
    // removed saveDB() { ... }
    saveDB() { Database.save(this.db); }

    // removed showError(message) { ... }
    // Proxy for UI helpers to maintain compatibility with index.html
    showError(m) { this.ui.showError(m); }
    toast(m) { this.ui.toast(m); }
    closeModal() { this.ui.closeModal(); }

    init() {
        this.setupEventListeners();
        this.applyTranslations();
        this.renderAll();
        this.initCharts();
        this.updateKPIs();
    }

    toggleLanguage() {
        this.lang = this.lang === 'es' ? 'en' : 'es';
        localStorage.setItem('smartbill_lang', this.lang);
        this.applyTranslations();
        this.ui.toast(this.lang === 'es' ? "Idioma cambiado a Español" : "Language changed to English");
    }

    applyTranslations() {
        const t = translations[this.lang];
        
        // Login
        document.getElementById('login-user').placeholder = t.login_user;
        document.getElementById('login-pass').placeholder = t.login_pass;
        document.getElementById('btn-submit-login').textContent = t.login_btn;
        document.querySelectorAll('.lang-label').forEach(el => el.textContent = t.btn_lang);

        // Nav
        const navMap = {
            'dashboard': t.nav_dashboard,
            'cash-register': t.nav_pos,
            'banks': t.nav_banks,
            'clients': t.nav_clients,
            'inventory': t.nav_inventory,
            'config': t.nav_config,
            'data-explorer': t.nav_explorer
        };
        document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
            const sec = btn.dataset.section;
            if (navMap[sec]) {
                const icon = btn.querySelector('i').outerHTML;
                btn.innerHTML = `${icon} ${navMap[sec]}`;
            }
        });
        document.getElementById('btn-daily-analysis').innerHTML = `<i class="fas fa-microchip"></i> ${t.nav_analysis}`;

        // Explorer (SQL)
        document.getElementById('t-explorer-title').textContent = t.sql_title;
        document.getElementById('t-dev-mode').textContent = t.sql_dev;
        document.getElementById('t-tables-label').textContent = t.sql_tables;
        document.getElementById('t-sql-status').textContent = t.sql_status;
        document.getElementById('t-sql-refresh').textContent = t.sql_refresh;
        document.getElementById('t-sql-execute').textContent = t.sql_execute;
        document.querySelectorAll('.sql-keyword').forEach((el, idx) => {
             if (idx === 0) el.textContent = t.sql_select;
        });

        // New buttons
        document.getElementById('btn-export').textContent = t.btn_export;
        document.getElementById('btn-import').textContent = t.btn_import;
        document.getElementById('btn-invoice').textContent = t.btn_invoice;

        // Update page title if necessary
        const activeSection = document.querySelector('.section-view.active')?.id;
        if (activeSection) this.showSection(activeSection);
        // Update explorer modal translations if open
        if (document.getElementById('data-explorer-login-modal').classList.contains('open')) {
            this.updateExplorerModalTranslations();
        }
    }

    setupEventListeners() {
        document.getElementById('btn-submit-login').onclick = () => this.handleLogin();
        document.getElementById('btn-lang-toggle-login').onclick = () => this.toggleLanguage();
        document.getElementById('btn-lang-toggle-app').onclick = () => this.toggleLanguage();
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = (e) => this.showSection(e.currentTarget.dataset.section);
        });
        document.getElementById('hamburger-btn').onclick = () => {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebar-backdrop').classList.toggle('active');
        };
        document.getElementById('pos-search-input').onkeyup = (e) => this.filterPOSQuickResults(e.target.value);
        document.getElementById('btn-inventory-trigger').onclick = () => this.openProductSelectionMenu();
        document.getElementById('btn-cobrar').onclick = () => this.pos.processSale();
        document.getElementById('btn-cancelar-ticket').onclick = () => this.clearTicket();
        document.getElementById('btn-daily-analysis').onclick = () => this.handleDailyAnalysis();
        document.getElementById('btn-logout').onclick = () => this.handleLogout();
        // Register form events
        document.getElementById('switch-to-register').onclick = () => this.switchToRegister();
        document.getElementById('switch-to-login').onclick = () => this.switchToLogin();
        document.getElementById('btn-submit-register').onclick = () => this.handleRegister();
        // Explorer login modal events
        document.getElementById('explorer-login-btn').onclick = () => this.handleExplorerLogin();
        document.getElementById('explorer-register-btn').onclick = () => this.handleExplorerRegister();
        document.getElementById('explorer-switch-to-register').onclick = () => this.switchToRegisterForm();
        document.getElementById('explorer-switch-to-login').onclick = () => this.switchToLoginForm();
    }

    async handleLogin() {
        const t = translations[this.lang];
        const u = document.getElementById('login-user').value;
        const p = document.getElementById('login-pass').value;
        if (!u) return this.ui.showError(t.error_user_empty);
        if (!p) return this.ui.showError(t.error_pass_empty);
        if (p.length !== 6) return this.ui.showError("La clave debe tener 6 dígitos");

        // First, load the default database to check users
        const defaultDb = await Database.load();
        const user = defaultDb.users.find(user => user.username === u && user.password === p);
        if (user) {
            this.currentUser = user;
            localStorage.setItem('smartbill_current_user', JSON.stringify(user));

            // Load user's specific database
            this.db = await Database.load(`smartbill_pro_db_${u}`);

            this.ui.playSound('asset_name.mp3');
            document.getElementById('login-wrapper').style.opacity = '0';
            setTimeout(() => document.getElementById('login-wrapper').style.display = 'none', 500);
            this.ui.toast(`${t.welcome}, ${user.fullname}`);
        } else {
            this.ui.showError(t.error_invalid);
        }
    }

    handleRegister() {
        const t = translations[this.lang];
        const fullname = document.getElementById('register-fullname').value;
        const username = document.getElementById('register-user').value;
        const password = document.getElementById('register-pass').value;
        if (!fullname) return this.ui.showError("El nombre completo es obligatorio");
        if (!username) return this.ui.showError(t.error_user_empty);
        if (!password) return this.ui.showError(t.error_pass_empty);
        if (password.length !== 6) return this.ui.showError("La clave debe tener 6 dígitos");
        const existingUser = this.db.users.find(user => user.username === username);
        if (existingUser) return this.ui.showError("El usuario ya existe");
        this.db.users.push({ id: Date.now(), fullname, username, password });
        this.saveDB();
        this.ui.toast("Registro exitoso. Ahora puedes iniciar sesión.");
        this.switchToLogin();
    }

    switchToRegister() {
        document.getElementById('login-form-section').style.display = 'none';
        document.getElementById('register-form-section').style.display = 'block';
    }

    switchToLogin() {
        document.getElementById('register-form-section').style.display = 'none';
        document.getElementById('login-form-section').style.display = 'block';
    }

    showSection(id) {
        if (id === 'data-explorer' && !this.isExplorerLoggedIn) {
            this.showExplorerLoginModal();
            return;
        }
        document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-btn[data-section="${id}"]`);
        if (activeNav) activeNav.classList.add('active');
        const titles = { 'dashboard': 'Panel de control', 'cash-register': 'Punto de Venta', 'inventory': 'Inventario', 'clients': 'Mis Clientes', 'banks': 'Bancos', 'data-explorer': 'Explorador', 'config': 'Configuración' };
        document.getElementById('page-title').textContent = titles[id] || id;
        if (id === 'data-explorer') this.refreshExplorer();
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebar-backdrop').classList.remove('active');
        }
    }

    renderAll() {
        this.renderInventory();
        this.renderClients();
        this.renderBanks();
        this.renderPOS();
        this.renderConfig();
    }

    renderInventory() {
        const tbody = document.querySelector('#inventory-table tbody');
        if (!tbody) return;
        tbody.innerHTML = this.db.inventory.map(p => `
            <tr>
                <td><strong>${p.id}</strong></td>
                <td>${p.name}</td>
                <td>$${p.price.toFixed(2)}</td>
                <td>${p.stock}</td>
                <td><span style="color: ${p.stock < 5 ? 'red' : 'green'}; font-weight: 700;">${p.stock < 5 ? 'BAJO' : 'OK'}</span></td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="window.app.openModal('product', '${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline btn-sm" style="color: var(--danger)" onclick="window.app.deleteItem('inventory', '${p.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    renderPOS() {
        const select = document.getElementById('pos-client-select');
        if (select) select.innerHTML = this.db.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        this.filterPOSQuickResults("");
    }

    filterPOSQuickResults(query) {
        const container = document.getElementById('pos-quick-results');
        if (!container) return;
        const q = query.toLowerCase();
        const results = this.db.inventory.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 6);
        container.innerHTML = results.map(p => `<button class="btn btn-outline btn-sm" onclick="window.app.showProductDetailView('${p.id}')">${p.name} (${p.stock})</button>`).join('');
    }

    openProductSelectionMenu() {
        const container = document.getElementById('product-list-menu-container');
        if (container) {
            container.innerHTML = this.db.inventory.map(p => `
                <div class="product-item-card" onclick="window.app.showProductDetailView('${p.id}')">
                    <strong>${p.name}</strong>
                    <span>$${p.price.toFixed(2)}</span>
                    <p style="font-size: 0.7rem; color: #666; margin-top: 5px;">Stock: ${p.stock}</p>
                </div>
            `).join('');
        }
        document.getElementById('product-list-overlay').classList.add('open');
    }

    showProductDetailView(id) {
        const p = this.db.inventory.find(x => x.id === id);
        if (!p) return;
        this.ui.closeModal();
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const confirm = document.getElementById('modal-confirm-btn');
        title.innerHTML = `<i class="fas fa-info-circle"></i> Detalle del Producto`;
        body.innerHTML = `<div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid var(--border);"><div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;"><div style="width: 80px; height: 80px; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--primary); border: 1px solid var(--border);"><i class="fas fa-box"></i></div><div><h2 style="font-size: 1.4rem; color: var(--sidebar-bg);">${p.name}</h2><span class="badge" style="background: var(--primary); color: white;">SKU: ${p.id}</span></div></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;"><div class="form-group"><label>Cantidad en Bodega</label><div style="font-size: 1.5rem; font-weight: 800; color: ${p.stock < 5 ? 'var(--danger)' : 'var(--success)'}">${p.stock} unidades</div></div><div class="form-group"><label>Costo Base (Sin IVA/Desc)</label><div style="font-size: 1.5rem; font-weight: 800; color: var(--primary-dark)">$${p.price.toFixed(2)}</div></div></div><hr style="margin: 20px 0; border: none; border-top: 1px solid var(--border);"><p style="font-size: 0.8rem; color: var(--text-light); font-style: italic;">Nota: Los impuestos y descuentos adicionales se calculan al momento de agregar a la factura.</p></div>`;
        confirm.innerText = "AGREGAR A VENTA";
        confirm.className = "btn btn-primary btn-block";
        confirm.onclick = () => { this.pos.addToTicket(p.id); this.ui.closeModal(); };
        overlay.classList.add('open');
    }

    // removed addToTicket(id) { ... }
    // Proxy for POS logic
    renderTicket() { this.pos.renderTicket(); }
    updateTicketQty(idx, val) {
        const qty = parseInt(val);
        const item = this.currentTicket[idx];
        const prod = this.db.inventory.find(p => p.id === item.id);
        if (qty > prod.stock) { this.ui.showError(`Cantidad solicitada supera el inventario (${prod.stock}).`); item.qty = prod.stock; } 
        else if (qty > 0) { item.qty = qty; }
        this.renderTicket();
    }
    removeFromTicket(idx) { this.currentTicket.splice(idx, 1); this.renderTicket(); }
    clearTicket() { this.currentTicket = []; this.renderTicket(); }

    showInvoice(sale) {
        const client = this.db.clients.find(c => c.id == sale.clientId);
        const cfg = this.db.config;
        const paymentMethods = {
            'efectivo': 'Efectivo',
            'tarjeta': 'Tarjeta de Crédito/Débito',
            'transferencia': 'Transferencia Bancaria',
            'credito': 'Crédito'
        };
        const container = document.getElementById('invoice-content');
        if (!container) return;
        container.innerHTML = `<div style="text-align: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px;"><h2>${cfg.name}</h2><p>NIT: ${cfg.nit}</p><p>${cfg.address}</p></div><div style="display: flex; justify-content: space-between; margin-bottom: 20px;"><div><p><strong>Cliente:</strong> ${client.name}</p><p><strong>ID:</strong> ${client.nit}</p></div><div style="text-align: right;"><p><strong>Factura:</strong> #${sale.id}</p><p><strong>Fecha:</strong> ${new Date(sale.date).toLocaleString()}</p></div></div><div style="margin-bottom: 20px;"><p><strong>Forma de Pago:</strong> ${paymentMethods[sale.paymentMethod] || sale.paymentMethod}</p></div><table style="width: 100%; margin-bottom: 20px;"><thead><tr style="border-bottom: 1px solid #333;"><th style="text-align: left">Item</th><th style="text-align: center">Cant</th><th style="text-align: right">Total</th></tr></thead><tbody>${sale.items.map(i => `<tr><td>${i.name}</td><td style="text-align: center">${i.qty}</td><td style="text-align: right">$${(i.price * i.qty).toFixed(2)}</td></tr>`).join('')}</tbody></table><div style="text-align: right; font-size: 1.2rem; font-weight: 800; border-top: 1px solid #eee; padding-top: 10px;">TOTAL: $${sale.total.toFixed(2)}</div><p style="text-align: center; margin-top: 40px; color: #888;">${cfg.footer}</p>`;
        document.getElementById('invoice-modal-overlay').classList.add('open');
    }

    renderClients() {
        const tbody = document.querySelector('#clients-table tbody');
        if (!tbody) return;
        tbody.innerHTML = this.db.clients.map(c => `<tr><td><strong>${c.name}</strong></td><td>${c.nit}</td><td>${c.phone}</td><td>${c.email}</td><td><button class="btn btn-outline btn-sm" onclick="window.app.openModal('client', ${c.id})"><i class="fas fa-edit"></i></button><button class="btn btn-outline btn-sm" style="color: var(--danger)" onclick="window.app.deleteItem('clients', ${c.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    }

    renderBanks() {
        const tbody = document.querySelector('#banks-table tbody');
        if (!tbody) return;
        tbody.innerHTML = this.db.banks.map(b => `<tr><td><strong>${b.entity}</strong></td><td>${b.type} • ${b.number}</td><td>$${b.balance.toLocaleString()}</td><td><button class="btn btn-outline btn-sm" onclick="window.app.openModal('bank', ${b.id})"><i class="fas fa-edit"></i></button></td></tr>`).join('');
    }

    renderConfig() {
        const cfg = this.db.config;
        if (document.getElementById('cfg-name')) {
            document.getElementById('cfg-name').value = cfg.name;
            document.getElementById('cfg-nit').value = cfg.nit;
            document.getElementById('cfg-phone').value = cfg.phone;
            document.getElementById('cfg-email').value = cfg.email;
            document.getElementById('cfg-address').value = cfg.address;
            document.getElementById('cfg-footer').value = cfg.footer;
        }
    }

    saveConfig() {
        this.db.config = { name: document.getElementById('cfg-name').value, nit: document.getElementById('cfg-nit').value, address: document.getElementById('cfg-address').value, phone: document.getElementById('cfg-phone').value, email: document.getElementById('cfg-email').value, footer: document.getElementById('cfg-footer').value };
        this.saveDB();
        this.ui.toast("Configuración guardada");
    }

    openModal(type, id) {
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const confirm = document.getElementById('modal-confirm-btn');
        let data = null;
        if (id) {
            if (type === 'product') data = this.db.inventory.find(x => x.id === id);
            if (type === 'client') data = this.db.clients.find(x => x.id == id);
            title.innerText = `Editar ${type}`;
        } else { title.innerText = `Nuevo ${type}`; }
        if (type === 'product') {
            body.innerHTML = `<div class="form-group"><label>Nombre del Producto</label><input id="m-p-name" class="form-control" value="${data?.name || ''}"></div><div class="form-group"><label>Precio</label><input type="number" id="m-p-price" class="form-control" value="${data?.price || 0}"></div><div class="form-group"><label>Stock</label><input type="number" id="m-p-stock" class="form-control" value="${data?.stock || 0}"></div>`;
            confirm.onclick = () => {
                const name = document.getElementById('m-p-name').value;
                if (!name) return this.ui.showError("El nombre del producto no puede estar vacío.");
                const item = { id: data?.id || `P${Math.floor(Math.random()*1000)}`, name: name, price: parseFloat(document.getElementById('m-p-price').value), stock: parseInt(document.getElementById('m-p-stock').value) };
                if (id) Object.assign(data, item); else this.db.inventory.push(item);
                this.finalizeModal();
            };
        } else if (type === 'client') {
            body.innerHTML = `<div class="form-group"><label>Nombre</label><input id="m-c-name" class="form-control" value="${data?.name || ''}"></div><div class="form-group"><label>NIT / CC</label><input id="m-c-nit" class="form-control" value="${data?.nit || ''}"></div><div class="form-group"><label>Email</label><input id="m-c-email" class="form-control" value="${data?.email || ''}"></div>`;
            confirm.onclick = () => {
                const name = document.getElementById('m-c-name').value;
                if (!name) return this.ui.showError("El nombre del cliente es obligatorio.");
                const item = { id: data?.id || Date.now(), name, nit: document.getElementById('m-c-nit').value, email: document.getElementById('m-c-email').value };
                if (id) Object.assign(data, item); else this.db.clients.push(item);
                this.finalizeModal();
            };
        }
        overlay.classList.add('open');
    }

    finalizeModal() { this.saveDB(); this.renderAll(); this.ui.closeModal(); }

    deleteItem(collection, id) {
        if (!confirm('¿Seguro que desea eliminar?')) return;
        this.db[collection] = this.db[collection].filter(x => x.id != id);
        this.saveDB();
        this.renderAll();
    }

    updateKPIs() {
        const todayStr = new Date().toDateString();
        const salesToday = this.db.sales.filter(s => new Date(s.date).toDateString() === todayStr);
        const revenue = salesToday.reduce((a, b) => a + b.total, 0);
        if (document.getElementById('kpi-sales-today')) {
            document.getElementById('kpi-sales-today').textContent = `$${revenue.toLocaleString()}`;
            document.getElementById('kpi-count-today').textContent = salesToday.length;
            document.getElementById('kpi-lowstock').textContent = this.db.inventory.filter(p => p.stock < 5).length;
        }
    }

    initCharts() {
        const chartEl = document.getElementById('salesChart');
        if (!chartEl) return;
        const ctx = chartEl.getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
                datasets: [{ label: 'Ventas de la semana', data: [120, 190, 300, 50, 230, 420, 150], borderColor: '#0ea5e9', tension: 0.4, fill: true, backgroundColor: 'rgba(14, 165, 233, 0.1)' }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    refreshExplorer() {
        const table = this.currentExplorerTable || 'inventory';
        const editor = document.getElementById('explorer-sql-editor');
        if (editor) editor.value = `SELECT * FROM ${table};`;

        const status = document.getElementById('t-sql-status');
        if (status) status.textContent = this.lang === 'es' ? `Listo para consultar '${table}'.` : `Ready to query '${table}'.`;
    }

    selectExplorerTable(table, btn) {
        document.querySelectorAll('.explorer-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentExplorerTable = table;
        this.refreshExplorer();
    }

    executeSQLQuery() {
        try {
            const query = document.getElementById('explorer-sql-editor').value.trim();
            const result = this.parseSQLQuery(query);
            document.getElementById('sql-results').textContent = JSON.stringify(result, null, 2);
            document.getElementById('sql-results-container').style.display = 'block';

            const status = document.getElementById('t-sql-status');
            if (status) status.textContent = this.lang === 'es' ? "Consulta ejecutada exitosamente." : "Query executed successfully.";
        } catch (e) {
            this.ui.showError(this.lang === 'es' ? "ERROR SQL: " + e.message : "SQL ERROR: " + e.message);
        }
    }

    parseSQLQuery(query) {
        const upperQuery = query.toUpperCase();
        if (!upperQuery.startsWith('SELECT')) {
            throw new Error("Solo se soportan consultas SELECT por ahora.");
        }

        const fromIndex = upperQuery.indexOf('FROM');
        if (fromIndex === -1) {
            throw new Error("Consulta SELECT debe incluir FROM.");
        }

        const tableName = query.substring(fromIndex + 4).trim().replace(';', '').toLowerCase();
        if (!this.db[tableName]) {
            throw new Error(`Tabla '${tableName}' no existe.`);
        }

        return this.db[tableName];
    }

    handleDailyAnalysis() {
        const todayStr = new Date().toLocaleDateString();
        const salesToday = this.db.sales.filter(s => new Date(s.date).toLocaleDateString() === todayStr);
        const revenue = salesToday.reduce((a, b) => a + b.total, 0);
        const itemsSold = salesToday.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.qty, 0), 0);
        const report = `ANÁLISIS DE OPERACIONES - ${todayStr}\n-----------------------------------\nVentas realizadas: ${salesToday.length}\nProductos movidos: ${itemsSold}\nIngreso Bruto: $${revenue.toLocaleString()}\nEstado de Inventario: ${this.db.inventory.filter(p => p.stock < 5).length} productos en nivel crítico.`;
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const confirm = document.getElementById('modal-confirm-btn');
        title.innerText = "Reporte de Análisis IA";
        body.innerHTML = `<pre style="background:#f1f5f9; padding:15px; border-radius:8px; font-size:0.85rem; line-height:1.5;">${report}</pre>`;
        confirm.innerText = "Cerrar";
        confirm.onclick = () => this.ui.closeModal();
        overlay.classList.add('open');
    }

    showExplorerLoginModal() {
        document.getElementById('data-explorer-login-modal').classList.add('open');
        this.updateExplorerModalTranslations();
    }

    updateExplorerModalTranslations() {
        const t = translations[this.lang];
        document.getElementById('explorer-modal-title').textContent = t.explorer_login_title;
        document.getElementById('explorer-username-label').textContent = t.explorer_username;
        document.getElementById('explorer-password-label').textContent = t.explorer_password;
        document.getElementById('explorer-login-btn').textContent = t.explorer_login_btn;
        document.getElementById('explorer-switch-to-register').textContent = t.explorer_switch_to_register;
        document.getElementById('explorer-reg-username-label').textContent = t.explorer_username;
        document.getElementById('explorer-reg-password-label').textContent = t.explorer_password;
        document.getElementById('explorer-register-btn').textContent = t.explorer_register_btn;
        document.getElementById('explorer-switch-to-login').textContent = t.explorer_switch_to_login;
    }

    handleExplorerLogin() {
        const t = translations[this.lang];
        const username = document.getElementById('explorer-username').value.trim();
        const password = document.getElementById('explorer-password').value.trim();
        if (!username || !password) {
            this.ui.showError(t.explorer_error_empty);
            return;
        }
        const user = this.db.explorerUsers.find(u => u.username === username && u.password === password);
        if (user) {
            this.isExplorerLoggedIn = true;
            document.getElementById('data-explorer-login-modal').classList.remove('open');
            this.showSection('data-explorer');
            this.ui.toast(`${t.welcome}, ${username}`);
        } else {
            this.ui.showError(t.explorer_error_invalid);
        }
    }

    handleExplorerRegister() {
        const t = translations[this.lang];
        const username = document.getElementById('explorer-reg-username').value.trim();
        const password = document.getElementById('explorer-reg-password').value.trim();
        if (!username || !password) {
            this.ui.showError(t.explorer_error_empty);
            return;
        }
        const existingUser = this.db.explorerUsers.find(u => u.username === username);
        if (existingUser) {
            this.ui.showError(t.explorer_error_exists);
            return;
        }
        this.db.explorerUsers.push({ username, password });
        this.saveDB();
        this.ui.toast(t.explorer_register_success);
        this.switchToLoginForm();
    }

    switchToRegisterForm() {
        document.getElementById('explorer-login-form').style.display = 'none';
        document.getElementById('explorer-register-form').style.display = 'block';
        document.getElementById('explorer-modal-title').textContent = translations[this.lang].explorer_register_title;
    }

    switchToLoginForm() {
        document.getElementById('explorer-register-form').style.display = 'none';
        document.getElementById('explorer-login-form').style.display = 'block';
        document.getElementById('explorer-modal-title').textContent = translations[this.lang].explorer_login_title;
    }

    handleLogout() {
        // Reset login state
        this.isExplorerLoggedIn = false;
        this.currentUser = null;
        localStorage.removeItem('smartbill_current_user');
        // Show login wrapper again
        document.getElementById('login-wrapper').style.display = 'flex';
        document.getElementById('login-wrapper').style.opacity = '1';
        // Clear any active sections
        document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
        // Optionally clear form fields
        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
        // Toast message
        this.ui.toast(this.lang === 'es' ? 'Sesión cerrada' : 'Logged out');
    }

    exportData() {
        const table = this.currentExplorerTable;
        const data = this.db[table];
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `${table}_export.json`;
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        this.ui.toast(this.lang === 'es' ? 'Datos exportados' : 'Data exported');
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        const table = this.currentExplorerTable;
                        if (Array.isArray(data) || table === 'config') {
                            this.db[table] = data;
                            this.saveDB();
                            this.refreshExplorer();
                            this.renderAll();
                            this.updateKPIs();
                            this.ui.toast(this.lang === 'es' ? 'Datos importados' : 'Data imported');
                        } else {
                            this.ui.showError(this.lang === 'es' ? 'Formato inválido' : 'Invalid format');
                        }
                    } catch (error) {
                        this.ui.showError(this.lang === 'es' ? 'Error al importar' : 'Import error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    generateInvoice() {
        const table = this.currentExplorerTable;
        const data = this.db[table];
        if (table === 'sales' && data.length > 0) {
            const sale = data[data.length - 1]; // Last sale
            this.showInvoice(sale);
        } else {
            this.ui.showError(this.lang === 'es' ? 'No hay ventas para generar factura' : 'No sales to generate invoice');
        }
    }
}

window.app = new SmartBillApp();
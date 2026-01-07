export class POSManager {
    constructor(app) {
        this.app = app;
    }

    renderTicket() {
        const tbody = document.querySelector('#pos-ticket-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = this.app.currentTicket.map((item, idx) => `
            <tr>
                <td>${item.name}</td>
                <td>
                    <input type="number" value="${item.qty}" min="1" max="${this.app.db.inventory.find(p=>p.id===item.id).stock}" 
                    style="width: 45px;" onchange="window.app.updateTicketQty(${idx}, this.value)">
                </td>
                <td>$${(item.price * item.qty).toFixed(2)}</td>
                <td><button class="btn btn-sm" style="color: red" onclick="window.app.removeFromTicket(${idx})">&times;</button></td>
            </tr>
        `).join('');

        const subtotal = this.app.currentTicket.reduce((acc, item) => acc + (item.price * item.qty), 0);
        const taxRate = parseFloat(document.getElementById('pos-tax-rate').value) || 0;
        const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
        
        const total = (subtotal * (1 + taxRate/100)) - discount;

        document.getElementById('pos-subtotal').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('pos-total').textContent = `$${Math.max(0, total).toFixed(2)}`;
    }

    addToTicket(id) {
        const p = this.app.db.inventory.find(x => x.id === id);
        if (!p) {
            this.app.ui.showError("El producto no existe en el sistema.");
            return;
        }
        if (p.stock <= 0) {
            this.app.ui.showError(`El producto ${p.name} no tiene existencias disponibles.`);
            return;
        }
        
        const existing = this.app.currentTicket.find(x => x.id === id);
        if (existing) {
            if (existing.qty < p.stock) {
                existing.qty++;
            } else {
                this.app.ui.showError("No hay más existencias de este producto.");
            }
        } else {
            this.app.currentTicket.push({ ...p, qty: 1 });
        }
        this.renderTicket();
    }

    processSale() {
        if (this.app.currentTicket.length === 0) {
            this.app.ui.showError("No puedes procesar una venta sin productos en el carrito.");
            return;
        }

        const clientId = document.getElementById('pos-client-select').value;
        const paymentMethod = document.getElementById('pos-payment-method').value;
        const total = parseFloat(document.getElementById('pos-total').textContent.replace('$', ''));
        const subtotal = parseFloat(document.getElementById('pos-subtotal').textContent.replace('$', ''));

        this.app.currentTicket.forEach(item => {
            const p = this.app.db.inventory.find(x => x.id === item.id);
            if (p) p.stock -= item.qty;
        });

        const sale = {
            id: Date.now(),
            date: new Date(),
            clientId,
            paymentMethod,
            items: [...this.app.currentTicket],
            total,
            subtotal
        };

        this.app.db.sales.push(sale);
        this.app.saveDB();
        this.app.ui.playSound('asset_name.mp3');

        this.app.showInvoice(sale);
        this.app.clearTicket();
        this.app.renderAll();
        this.app.updateKPIs();
        this.app.ui.toast("Venta realizada con éxito");
    }
}
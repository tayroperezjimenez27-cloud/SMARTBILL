export class UIUtils {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    showError(message) {
        const overlay = document.getElementById('custom-alert-overlay');
        const msgText = document.getElementById('custom-alert-message');
        if (msgText) msgText.textContent = message;
        if (overlay) overlay.classList.add('open');
    }

    async playSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (e) {
            console.warn("Audio play failed", e);
        }
    }

    toast(msg) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.cssText = `background: #1e293b; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: slideIn 0.3s;`;
        t.textContent = msg;
        container.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    closeModal() {
        const modal = document.getElementById('modal-overlay');
        if (modal) modal.classList.remove('open');
        const productList = document.getElementById('product-list-overlay');
        if (productList) productList.classList.remove('open');
    }
}
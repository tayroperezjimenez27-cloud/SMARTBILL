import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DB_KEY = 'smartbill_pro_db_v2';

export const defaultDB = {
    config: {
        name: "NEGOCIO INTELIGENTE S.A.S",
        nit: "900.123.456-7",
        address: "Calle Principal #123",
        phone: "+57 300 000 0000",
        email: "ventas@minegocio.com",
        footer: "Gracias por su compra. Factura oficial."
    },
    clients: [
        { id: 1, name: "Cliente General", nit: "22222222", phone: "0", email: "general@mail.com" }
    ],
    inventory: [
        { id: 'P001', name: "Producto de Ejemplo A", price: 1500.00, stock: 50 },
        { id: 'P002', name: "Producto de Ejemplo B", price: 850.00, stock: 12 },
        { id: 'P003', name: "Producto Premium", price: 4500.00, stock: 5 }
    ],
    banks: [
        { id: 1, entity: "Banco Principal", type: "Ahorros", number: "123-456-78", balance: 10000 }
    ],
    users: [
        { username: "contabilidad", password: "2177" }
    ],
    explorerUsers: [],
    sales: []
};

export class Database {
    static async load(key = DB_KEY) {
        const dbRef = ref(db, key);
        try {
            const snapshot = await get(dbRef);
            if (snapshot.exists()) {
                console.log('Database loaded from Firebase for key:', key);
                return snapshot.val();
            } else {
                console.log('No data in Firebase for key:', key, ', initializing with defaults.');
                await set(dbRef, defaultDB);
                return JSON.parse(JSON.stringify(defaultDB));
            }
        } catch (error) {
            console.error('Error loading database from Firebase for key:', key, ', using defaults:', error);
            return JSON.parse(JSON.stringify(defaultDB));
        }
    }

    static async save(data, key = DB_KEY) {
        const dbRef = ref(db, key);
        try {
            await set(dbRef, data);
            console.log('Database saved to Firebase for key:', key);
            return true;
        } catch (error) {
            console.error('Error saving database to Firebase for key:', key, error);
            return false;
        }
    }
}

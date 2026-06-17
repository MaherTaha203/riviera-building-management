import bcrypt from "bcryptjs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const adminHash = await bcrypt.hash("admin123", 10);
const mgrHash = await bcrypt.hash("manager123", 10);

await client.query(`
  INSERT INTO users (username, name, password_hash, role) VALUES
  ('admin', 'مدير النظام', '${adminHash}', 'admin'),
  ('manager', 'أحمد الخوري', '${mgrHash}', 'manager')
  ON CONFLICT (username) DO NOTHING;
`);

await client.query(`
  INSERT INTO settings (building_name, building_address, default_currency, phone, email)
  VALUES ('Riviera Commercial Building', 'شارع المدينة، رام الله، فلسطين', 'ILS', '+970-2-000-0000', 'info@riviera-bms.ps')
  ON CONFLICT DO NOTHING;
`);

await client.query(`INSERT INTO exchange_rates (usd_to_ils, jod_to_ils) VALUES ('3.70', '5.22') ON CONFLICT DO NOTHING;`);

await client.query(`
  INSERT INTO units (unit_number, floor, type, area, status, description) VALUES
  ('101', '1', 'office', '85.00', 'occupied', 'مكتب تجاري - الطابق الأول'),
  ('102', '1', 'shop', '45.00', 'occupied', 'محل تجاري - الطابق الأول'),
  ('103', '1', 'office', '70.00', 'vacant', 'مكتب تجاري - الطابق الأول'),
  ('201', '2', 'office', '110.00', 'occupied', 'مكتب كبير - الطابق الثاني'),
  ('202', '2', 'office', '90.00', 'vacant', 'مكتب تجاري - الطابق الثاني'),
  ('301', '3', 'warehouse', '200.00', 'occupied', 'مستودع - الطابق الثالث'),
  ('302', '3', 'office', '65.00', 'maintenance', 'قيد الصيانة')
  ON CONFLICT (unit_number) DO NOTHING;
`);

await client.query(`
  INSERT INTO tenants (name, type, phone, email, id_number, address, balance) VALUES
  ('شركة النور التجارية', 'company', '+970-599-111-222', 'nour@example.ps', '123456789', 'رام الله، فلسطين', '0'),
  ('محمد علي سلامة', 'individual', '+970-598-333-444', 'msalameh@example.ps', '987654321', 'البيرة، فلسطين', '500.00'),
  ('مؤسسة الأمل للاستيراد', 'company', '+970-597-555-666', 'amal@example.ps', '555555555', 'رام الله، فلسطين', '0')
  ON CONFLICT DO NOTHING;
`);

await client.end();
console.log("Seeding complete");

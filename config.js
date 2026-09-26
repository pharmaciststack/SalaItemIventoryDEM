// =====================================================
// ตั้งค่าระบบ — แก้ไขไฟล์นี้ไฟล์เดียวตอน Deploy
// =====================================================
const APP_VERSION = '2.2.0';

// 1. Client ID เดียวกับระบบแจ้งซ่อม (ต้องเพิ่ม origin ของเว็บนี้ใน Google Cloud Console ด้วย)
const GOOGLE_CLIENT_ID = '854838901494-cuhmkrl29oj80i12apt7no01k763r3o2.apps.googleusercontent.com';

// 2. URL ของ Apps Script Web App (Deploy > New deployment) — ใช้ apps-script/Code.gs ในโปรเจกต์นี้
//    ถ้ายังไม่ได้ใส่ และเปิดบน localhost ระบบจะเข้าโหมดทดสอบ (Mock) อัตโนมัติ
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxr_xjXz_E6CLGKbLAMv6hI8u_LIwHTHb-NcIPZtdG-lAymJrgKYneAhq05H9Dazt-gQA/exec';

// 2b. URL ของ Apps Script ตัวเดิม (ระบบ v1.2.1) — ใช้ชั่วคราวเพื่ออ่าน/บันทึกข้อมูลจริง
//     โหมดนี้ทำได้: ดู ค้นหา ลงทะเบียน แก้สเปค/หมายเหตุ พิมพ์ QR (ไม่มีเข้าสู่ระบบ/เช็คสต็อก/จำหน่าย)
//     เมื่อ deploy Code.gs ตัวใหม่แล้ว ให้ใส่ URL ใหม่ใน APPS_SCRIPT_URL ด้านบน ระบบจะเลิกใช้ตัวนี้เอง
const LEGACY_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxr_xjXz_E6CLGKbLAMv6hI8u_LIwHTHb-NcIPZtdG-lAymJrgKYneAhq05H9Dazt-gQA/exec';

// 3. ลิงก์คู่มือการใช้งาน
const GUIDE_URL = 'https://drive.google.com/file/d/14wi-0MlLPe8Af2ZnQWGUsQDYxhRAz4IO/view?usp=sharing';

// 4. รายชื่อสาขา (ชุดเดียวกับระบบแจ้งซ่อม)
const BRANCH_LIST = [
  '01 คลังรีเทล', '02 เขาชะเมา', '03 แก่งหางแมว', '04 สระแก้ว', '05 เมืองใหม่นายอาม',
  '06 เขาไร่ยา', '07 แสนตุ้ง', '08 เขาดิน', '09 สอยดาว', '10 ตลาดเจริญสุข',
  '11 โป่งน้ำร้อน', '12 ทับช้าง', '13 วังสมบูรณ์', '14 ทุ่งขนาน', '15 ตราด',
  '16 ออฟฟิศ', '17 นายายอาม', '18 คลองหาด', '19 วังน้ำเย็น', '20 เกาะลอย',
  '21 เกาะขวาง', '23 อรัญประเทศ', '24 บิ๊กซีจันทบุรี', '25 แกลง', '26 ตาพระยา',
  '27 โคกสูง', '28 ขลุง', '29 พลับพลา', '30 วังน้ำเย็น2', '31 ตลาดเทศบาลตราด',
  '32 ตลาดพลิ้ว', '33 เขาฉกรรจ์', '34 วัฒนานคร', '35 หน้าโรงพยาบาลแกลง', '36 วังท่าช้าง',
  '99 ศรีชัยโอสถ',
];
window.BRANCH_LIST = BRANCH_LIST;

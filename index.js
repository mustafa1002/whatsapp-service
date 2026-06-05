const axios = require('axios');
const nodemailer = require('nodemailer');

// استبدل هذا الرابط برابط Web App الذي نسخته من قوقل شيت بعد النشر
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

// إعداد خدمة إرسال الإيميلات (Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'YOUR_EMAIL@gmail.com', // إيميلك المُرِسل
    pass: 'YOUR_APP_PASSWORD'     // كلمة مرور التطبيق الخاصة بقوقل
  }
});

// ذاكرة مؤقتة لمتابعة شرط الـ 5 أيام والرسائل المستمرة
let notificationHistory = {};

async function sendNotifications(toEmail, toPhone, subject, messageText) {
  // 1. إرسال الإيميل التلقائي (للمسؤول + أمين المجلس alhawanboard@gmail.com)
  try {
    await transporter.sendMail({
      from: 'YOUR_EMAIL@gmail.com',
      to: [toEmail, 'alhawanboard@gmail.com'],
      subject: subject,
      text: messageText
    });
    console.log(`تم إرسال الإيميل بنجاح إلى ${toEmail} و أمين المجلس.`);
  } catch (err) {
    console.error('خطأ في إرسال الإيميل:', err);
  }

  // 2. إرسال الواتساب التلقائي (للمسؤول + جوال المتابعة 0505960417)
  try {
    const targetPhones = [toPhone, '0505960417'];
    for (let phone of targetPhones) {
      if (phone) {
        // ملاحظة: هنا يتم دمج الكود مع موديول الواتساب الخاص بك بالمستودع (مثل whatsapp-web.js أو Twilio)
        console.log(`[واتساب تلقائي] جاري الإرسال للرقم ${phone}: ${messageText}`);
      }
    }
  } catch (err) {
    console.error('خطأ في إرسال الواتساب:', err);
  }
}

function formatDuration(ms) {
  const absoluteMs = Math.abs(ms);
  const days = Math.floor(absoluteMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absoluteMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absoluteMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absoluteMs % (1000 * 60)) / 1000);
  
  return `${days} يوم و ${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`;
}

async function runCountdownEngine() {
  try {
    // جلب البيانات حية من قوقل شيت
    const response = await axios.post(GOOGLE_SCRIPT_URL, { action: 'readSheetData' });
    if (response.data.status !== 'success') return;
    
    const rows = response.data.data;
    const now = new Date();
    
    for (let rowData of rows) {
      const { row, responsible, email, completionDate, deliveryDate } = rowData;
      const key = `row_${row}`;
      
      // 1. تصفير الخلايا الفارغة
      if (!deliveryDate) {
        await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: '', color: null });
        delete notificationHistory[key];
        continue;
      }
      
      const targetDate = new Date(deliveryDate);
      const diffMs = targetDate - now;
      const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
      
      // 2. فحص حالات التواريخ والعدادات
      if (!completionDate) {
        // حقل تاريخ الإنجاز فارغ
        if (diffMs > twoDaysInMs) {
          // الشرط الإضافي الذكي: الوضع الطبيعي الآمن (أكثر من يومين)
          const countdownText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: countdownText, color: '#D4EDDA' }); // أخضر فاتح
        } 
        else if (diffMs <= twoDaysInMs && diffMs > 0) {
          // حالة اقتراب الموعد (أقل من يومين) - لون برتقالي والعداد مستمر
          const countdownText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: countdownText, color: '#FFECCA' }); // برتقالي فاتح/مريح للعين
          
          // إرسال الإشعار وتكراره كل 5 أيام آلياً
          if (!notificationHistory[key] || (now - new Date(notificationHistory[key].lastSent)) >= 5 * 24 * 60 * 60 * 1000) {
            const msg = `تنبيه لم يتبقى على موعد التسليم سوى : ${countdownText}`;
            await sendNotifications(email, '0505960417', 'تنبيه: اقتراب موعد تسليم مهمة', msg);
            notificationHistory[key] = { lastSent: now, state: 'orange_warning' };
          }
        } 
        else {
          // حالة تجاوز الموعد وتأخر الإنجاز - لون أحمر فاتح والعداد يستمر تصاعدياً لبيان مدة التأخير
          const delayText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: delayText, color: '#F8D7DA' }); // أحمر فاتح
          
          if (!notificationHistory[key] || notificationHistory[key].state !== 'red_light_overdue' || (now - new Date(notificationHistory[key].lastSent)) >= 5 * 24 * 60 * 60 * 1000) {
            const msg = `تحذير سارع بالانجاز طاف موعد التسليم المطلوب : ${delayText}`;
            await sendNotifications(email, '0505960417', 'تحذير: طاف موعد التسليم المطلوب', msg);
            notificationHistory[key] = { lastSent: now, state: 'red_light_overdue' };
          }
        }
      } 
      else {
        // تاريخ الإنجاز مكتوب (العداد يتوقف تماماً ويثبت القيمة)
        const compDate = new Date(completionDate);
        const finalDiff = targetDate - compDate;
        
        if (compDate <= targetDate) {
          // تم الإنجاز مبكراً بنجاح - لون أخضر وثبات المدة الزمنية المتبقية
          if (!notificationHistory[key] || notificationHistory[key].state !== 'done_early') {
            const durationText = formatDuration(finalDiff);
            const msg = `تم الإنجاز مبكراً بنجاح قبل التسليم بـ : ${durationText}`;
            
            await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: msg, color: '#28A745' }); // أخضر ثابت ومستقر
            await sendNotifications(email, '0505960417', 'تم الإنجاز مبكراً بنجاح', msg);
            notificationHistory[key] = { lastSent: now, state: 'done_early' };
          }
        } 
        else {
          // تم الإنجاز متأخراً - لون أحمر وثبات مدة التأخير الفعلي لحظة الإنجاز
          if (!notificationHistory[key] || notificationHistory[key].state !== 'done_late') {
            const durationText = formatDuration(finalDiff);
            const msg = `تم الإنجاز متأخراً بنجاح بعد التسليم بـ : ${durationText}`;
            
            await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: msg, color: '#DC3545' }); // أحمر ثابت ومستقر
            await sendNotifications(email, '0505960417', 'إشعار: تم الإنجاز متأخراً', msg);
            notificationHistory[key] = { lastSent: now, state: 'done_late' };
          }
        }
      }
    }
  } catch (error) {
    console.error("خطأ في معالجة المحرك البرمجي:", error);
  }
}

// تشغيل العداد التنازلي التلقائي كل ثانية (1000 مللي ثانية) بشكل لحظي ودائم
setInterval(runCountdownEngine, 1000);

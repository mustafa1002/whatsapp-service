const axios = require('axios');
const nodemailer = require('nodemailer');

// 🔴 الصق هنا الرابط الجديد الذي نسخته بعد النشر من داخل الملف الحالي مباشرة
const GOOGLE_SCRIPT_URL = 'AKfycbzmWFOjSub3ojOzL3v5eAd2l4CzSpChyw4PZbmW1i8';

// إعداد خدمة إرسال الإيميلات
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'YOUR_EMAIL@gmail.com', 
    pass: 'YOUR_APP_PASSWORD'     
  }
});

let notificationHistory = {};

async function sendNotifications(toEmail, toPhone, subject, messageText) {
  // 1. إرسال الإيميل التلقائي
  try {
    await transporter.sendMail({
      from: 'YOUR_EMAIL@gmail.com',
      to: [toEmail, 'alhawanboard@gmail.com'],
      subject: subject,
      text: messageText
    });
    console.log(`تم إرسال الإيميل بنجاح إلى ${toEmail}.`);
  } catch (err) {
    console.error('خطأ إرسال الإيميل:', err);
  }

  // 2. إرسال الواتساب التلقائي
  try {
    const targetPhones = [toPhone, '0505960417'];
    for (let phone of targetPhones) {
      if (phone) {
        console.log(`[واتساب] جاري الإرسال للرقم ${phone}: ${messageText}`);
      }
    }
  } catch (err) {
    console.error('خطأ إرسال الواتساب:', err);
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
    const response = await axios.post(GOOGLE_SCRIPT_URL, { action: 'readSheetData' });
    if (response.data.status !== 'success') {
      console.log("تنبيه من الشيت:", response.data.message);
      return;
    }
    
    const rows = response.data.data;
    const now = new Date();
    
    for (let rowData of rows) {
      const { row, responsible, email, completionDate, deliveryDate } = rowData;
      const key = `row_${row}`;
      
      if (!deliveryDate || deliveryDate === "yyyy/mm/dd") {
        await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: '', color: null });
        delete notificationHistory[key];
        continue;
      }
      
      const targetDate = new Date(deliveryDate);
      if (isNaN(targetDate.getTime())) {
        continue; // تخطي إذا كان تنسيق التاريخ غير صالح
      }
      
      const diffMs = targetDate - now;
      const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
      
      // إذا كان تاريخ الإنجاز فارغاً أو نصاً افتراضياً
      if (!completionDate || completionDate === "yyyy/mm/dd") {
        if (diffMs > twoDaysInMs) {
          const countdownText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: countdownText, color: '#D4EDDA' });
        } 
        else if (diffMs <= twoDaysInMs && diffMs > 0) {
          const countdownText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: `تنبيه لم يتبقى على موعد التسليم سوى : ${countdownText}`, color: '#FFECCA' });
          
          if (!notificationHistory[key] || (now - new Date(notificationHistory[key].lastSent)) >= 5 * 24 * 60 * 60 * 1000) {
            await sendNotifications(email, '0505960417', 'تنبيه: اقتراب موعد تسليم مهمة', `تنبيه لم يتبقى على موعد التسليم سوى : ${countdownText}`);
            notificationHistory[key] = { lastSent: now, state: 'orange_warning' };
          }
        } 
        else {
          const delayText = formatDuration(diffMs);
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: `تحذير سارع بالانجاز طاف موعد التسليم المطلوب : ${delayText}`, color: '#F8D7DA' });
          
          if (!notificationHistory[key] || notificationHistory[key].state !== 'red_light_overdue' || (now - new Date(notificationHistory[key].lastSent)) >= 5 * 24 * 60 * 60 * 1000) {
            await sendNotifications(email, '0505960417', 'تحذير: طاف موعد التسليم المطلوب', `تحذير سارع بالانجاز طاف موعد التسليم المطلوب : ${delayText}`);
            notificationHistory[key] = { lastSent: now, state: 'red_light_overdue' };
          }
        }
      } 
      else {
        // هناك تاريخ إنجاز حقيقي مكتوب
        const compDate = new Date(completionDate);
        if (isNaN(compDate.getTime())) continue;
        
        const finalDiff = targetDate - compDate;
        
        if (compDate <= targetDate) {
          const durationText = formatDuration(finalDiff);
          const msg = `تم الإنجاز مبكراً بنجاح قبل الموعد بـ : ${durationText}`;
          await axios.post(GOOGLE_SCRIPT_URL, { action: 'updateCountdown', row: row, text: msg, color: '#28A745' });
        } 
        else {
          const durationText = formatDuration(finalDiff);
          const msg = `تم الإنجاز متأخراً بعد الموعد بـ : ${durationText}`;
          await axios.post(GOOGLE_SCRIPT_URL, { action: '#DC3545', row: row, text: msg, color: '#DC3545' });
        }
      }
    }
  } catch (error) {
    console.error("خطأ المحرك البرمجي:", error);
  }
}

// فحص وتحديث دوري كل 5 ثوانٍ لضمان الاستقرار والتحديث الحي
setInterval(runCountdownEngine, 5000);

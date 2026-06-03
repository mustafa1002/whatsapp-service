const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json()); // لتمكين الخادم من قراءة بيانات JSON القادمة من جوجل شيت

// 1. إعداد برمجية الواتساب ويب
const client = new Client({
    authStrategy: new LocalAuth(), // لحفظ جلسة تسجيل الدخول حتى لا تضطر لمسح الـ QR في كل مرة يعاد تشغيل السيرفر
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] // خيارات أمان وأداء لكي يعمل المتصفح الوهمي بكفاءة داخل سيرفر Render المجاني
    }
});

// 2. توليد رمز الـ QR Code في لوحة تحكم السيرفر (Logs) عند التشغيل لأول مرة
client.on('qr', (qr) => {
    console.log('=== يرجى مسح رمز الـ QR أدناه لربط الواتساب ===');
    qrcode.generate(qr, { small: true });
});

// 3. طباعة رسالة عند إتمام الاتصال بالواتساب بنجاح
client.on('ready', () => {
    console.log('✅ خادم الواتساب متصل الآن وجاهز لاستقبال وإرسال الرسائل آلياً!');
});

// 4. بناء الرابط (API Endpoint) الذي سيستقبله Google Sheets للإرسال
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ success: false, error: 'البيانات المرسلة غير مكتملة (المطلوب: الهاتف والنص)' });
    }

    try {
        // تهيئة رقم الجوال بصيغة كود الدولة الدولي الصحيح المطلوبة لـ واتساب ويب
        // نقوم بإزالة الصفر الأول وإضافة كود السعودية 966 إن لم يكن موجوداً
        let cleanPhone = phone.toString().trim().replace(/[\s+]/g, '');
        if (cleanPhone.startsWith('05')) {
            cleanPhone = '966' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('5')) {
            cleanPhone = '966' + cleanPhone;
        }

        const whatsappId = `${cleanPhone}@c.us`;

        // إرسال الرسالة آلياً في الخلفية
        await client.sendMessage(whatsappId, message);
        console.log(`✉️ تم إرسال رسالة بنجاح إلى الرقم: ${cleanPhone}`);
        
        return res.status(200).json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
    } catch (error) {
        console.error('❌ فشل إرسال الرسالة:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// تشغيل الخادم على المنفذ (Port) المتاح من Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم السحابي يعمل الآن على المنفذ المفتوح: ${PORT}`);
});
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');

const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// هنا التحديث الذكي: تحويل الـ QR Code إلى رابط خارجي يسهل فتحه ومسحه
client.on('qr', (qr) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('==================================================');
    console.log('🔗 اضغط على الرابط أدناه لمسح الـ QR Code بجوالك فوراً:');
    console.log(qrUrl);
    console.log('==================================================');
});

client.on('ready', () => {
    console.log('✅ خادم الواتساب متصل وجاهز تماماً وبدون تدخل بشري!');
});

app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ success: false, error: 'البيانات غير مكتملة' });
    }
    try {
        let cleanPhone = phone.toString().trim().replace(/[\s+]/g, '');
        if (cleanPhone.startsWith('05')) {
            cleanPhone = '966' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('5')) {
            cleanPhone = '966' + cleanPhone;
        }
        const whatsappId = `${cleanPhone}@c.us`;
        await client.sendMessage(whatsappId, message);
        return res.status(200).json({ success: true, message: 'تم الإرسال بنجاح' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ: ${PORT}`);
});

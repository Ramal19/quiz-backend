const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Firebase faylının düzgün oxunması
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Məntiqi - Netlify daxil olmaqla bütün domenlərdən gələn sorğulara icazə verir
app.use(cors());
app.use(express.json());

// Aktiv imtahan sessiyalarını yadda saxlamaq üçün
const activeExams = new Map();

// 1. Şagird imtahana başlayanda çağrılır
app.post('/api/start-exam', (req, res) => {
    const { studentName } = req.body;

    if (!studentName || studentName.trim() === "") {
        return res.status(400).json({ success: false, message: 'Ad və soyad boş ola bilməz!' });
    }

    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

    // Server vaxtı ilə başlanğıc anı yadda saxlanılır
    activeExams.set(sessionId, {
        studentName: studentName.trim(),
        startTime: Date.now()
    });

    res.json({ success: true, sessionId });
});

// 2. İmtahan bitib cavablar göndərildikdə çağrılır və Firebase-ə yazılır
app.post('/api/submit-exam', async (req, res) => {
    try {
        const { sessionId, answers } = req.body;

        if (!sessionId || !activeExams.has(sessionId)) {
            return res.status(400).json({ success: false, message: 'Etibarsız və ya vaxtı bitmiş sessiya!' });
        }

        const sessionData = activeExams.get(sessionId);
        const currentTime = Date.now();
        const elapsedTime = currentTime - sessionData.startTime;

        // 40 dəqiqə + 1 dəqiqə şəbəkə gecikməsi güzəşti
        const MAX_TIME = (40 * 60 * 1000) + (60 * 1000);

        if (elapsedTime > MAX_TIME) {
            activeExams.delete(sessionId);
            return res.status(403).json({ success: false, message: 'İmtahan müddəti bitmişdir! Cavablar qəbul olunmadı.' });
        }

        // Nəticələri Firebase Firestore 'exam_results' kolleksiyasına yazırıq
        await db.collection('exam_results').add({
            studentName: sessionData.studentName,
            answers: answers || {},
            submittedAt: new Date(),
            durationMinutes: Math.round(elapsedTime / 60000)
        });

        // Sessiyanı yaddaşdan təmizləyirik
        activeExams.delete(sessionId);

        res.status(200).json({
            success: true,
            message: `Təşəkkürlər, ${sessionData.studentName}! Nəticəniz uğurla bazaya qeydə alındı.`
        });

    } catch (error) {
        console.error('Firebase xətası:', error);
        res.status(500).json({ success: false, error: 'Server və ya baza xətası baş verdi.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server uğurla işə düşdü: http://localhost:${PORT}`);
});
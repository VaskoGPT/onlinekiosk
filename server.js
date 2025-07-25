// server.js

const express = require('express');
const path = require('path');
const multer = require('multer'); // Для обработки загрузки файлов
const fs = require('fs').promises; // Для асинхронной работы с файловой системой
const { exec } = require('child_process'); // Для выполнения команд ОС (например, для печати)
const pdfParse = require('pdf-parse'); // Для работы с PDF-файлами

const app = express();
const port = 3000; // Порт, на котором будет работать сервер

// --- Настройка Multer для загрузки файлов ---
// Место для временного хранения загруженных файлов
const uploadDir = path.join(__dirname, 'uploads');

// Убедимся, что папка 'uploads' существует. Если нет, создадим ее.
fs.mkdir(uploadDir, { recursive: true })
    .then(() => console.log(`Папка для загрузок '${uploadDir}' готова.`))
    .catch(err => console.error('Ошибка при создании папки для загрузок:', err));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Сохраняем файлы в папку 'uploads'
    },
    filename: (req, file, cb) => {
        // Генерируем уникальное имя файла, чтобы избежать перезаписи и сохранить оригинальное расширение
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '_' + file.originalname);
    }
});

const upload = multer({ storage: storage });
// --- Конец настройки Multer ---

// Разрешаем Express обрабатывать JSON-тела запросов
app.use(express.json());

// Указываем Express, где искать статические файлы (HTML, CSS, JS для фронтенда)
app.use(express.static(path.join(__dirname, 'public')));

// --- Маршрут для загрузки файла ---
app.post('/upload-file', upload.single('file'), async (req, res) => {
    if (!req.file) {
        console.warn('Попытка загрузки без файла.');
        return res.status(400).json({ error: 'Файл не был загружен.' });
    }

    const filePath = req.file.path; // Полный путь к загруженному файлу на сервере
    const originalFileName = req.file.originalname;
    const serverFileName = req.file.filename; // Имя файла, под которым он сохранен на сервере

    console.log(`Получен файл: ${originalFileName}, сохранен как: ${serverFileName}, путь: ${filePath}`);

    let pageCount = 0;
    let errorMessage = null;

    try {
        // *** Реальная логика определения количества страниц для PDF, заглушка для остальных ***
        if (originalFileName.toLowerCase().endsWith('.pdf')) {
            const pdfDataBuffer = await fs.readFile(filePath); // Читаем PDF файл в буфер
            const pdfDocument = await pdfParse(pdfDataBuffer); // Парсим PDF
            pageCount = pdfDocument.numpages; // Получаем количество страниц
            console.log(`PDF-файл: ${originalFileName}, реально определено страниц: ${pageCount}`);
        } else if (originalFileName.toLowerCase().match(/\.(doc|docx)$/)) {
            // Заглушка для DOC/DOCX, так как решили пока пропустить конвертацию с LibreOffice
            pageCount = Math.floor(Math.random() * 5) + 1; // Заглушка: 1-5 страниц
            console.log(`DOC/DOCX-файл: ${originalFileName}, определено страниц: ${pageCount} (заглушка)`);
        } else {
            // Эта ветка, по идее, не должна достигаться, если фронтенд фильтрует файлы,
            // но служит как запасной вариант для неподдерживаемых форматов.
            errorMessage = 'Неподдерживаемый формат файла. Поддерживаются PDF, DOC, DOCX.';
            console.warn(`Неподдерживаемый формат: ${originalFileName}. Удаляем.`);
        }

        if (errorMessage) {
            // Удаляем загруженный неподдерживаемый файл
            await fs.unlink(filePath).catch(err => console.error('Ошибка при удалении неподдерживаемого файла:', err));
            return res.status(400).json({ error: errorMessage });
        }

        if (pageCount === 0) {
            errorMessage = 'Не удалось определить количество страниц в файле. Возможно, файл пуст или поврежден.';
            console.warn(`Определено 0 страниц для: ${originalFileName}. Удаляем.`);
            await fs.unlink(filePath).catch(err => console.error('Ошибка при удалении файла с 0 страниц:', err));
            return res.status(400).json({ error: errorMessage });
        }

        // Сохраняем полный путь к загруженному файлу, который будем печатать.
        // Здесь мы предполагаем, что на печать пойдет исходный файл.
        // Это важно, так как Multer сохраняет файл с новым именем.
        app.locals.fileToPrint = filePath;

        // Возвращаем фронтенду информацию о файле
        res.json({
            message: 'Файл успешно загружен',
            pageCount: pageCount,
            serverFileName: serverFileName // Отправляем имя файла, под которым он сохранен на сервере
        });

    } catch (error) {
        console.error('Ошибка при обработке файла:', error);
        // Удаляем файл в случае ошибки обработки
        if (filePath) {
            await fs.unlink(filePath).catch(err => console.error('Ошибка при удалении временного файла:', err));
        }
        res.status(500).json({ error: 'Не удалось обработать файл. Попробуйте другой файл.' });
    }
});

// --- Маршрут для обработки оплаты ---
app.post('/process-payment', async (req, res) => {
    // Получаем все данные, включая printType
    const { fileName, pageCount, cost, serverFileName, printType } = req.body;

    // Валидация serverFileName
    if (!serverFileName) {
        console.warn('Получен запрос на оплату без serverFileName.');
        return res.status(400).json({ error: 'Идентификатор файла на сервере отсутствует. Загрузите файл заново.' });
    }

    // Убедимся, что файл, который мы собираемся печатать, доступен.
    // Это должен быть тот же файл, путь к которому мы сохранили в app.locals.fileToPrint
    const originalUploadedFilePath = path.join(uploadDir, serverFileName);
    const finalFileToPrintPath = app.locals.fileToPrint;

    if (!finalFileToPrintPath || finalFileToPrintPath !== originalUploadedFilePath) {
         // Эта проверка нужна, чтобы удостовериться, что app.locals.fileToPrint не сбросился
         // и что это тот же файл, который был отправлен с фронтенда.
        console.warn('Файл для печати в app.locals.fileToPrint не соответствует или отсутствует.');
        return res.status(400).json({ error: 'Информация о файле для печати потеряна. Загрузите файл заново.' });
    }

    try {
        await fs.access(finalFileToPrintPath); // Проверяет наличие файла по указанному пути
    } catch (error) {
        console.error(`Файл "${serverFileName}" не найден на диске по пути: ${finalFileToPrintPath}.`, error);
        return res.status(400).json({ error: 'Файл для оплаты не найден на сервере. Пожалуйста, загрузите файл заново.' });
    }

    console.log(`Получен запрос на оплату: Файл "${fileName}" (на сервере: ${serverFileName}, для печати: ${finalFileToPrintPath}), страниц: ${pageCount}, стоимость: ${cost} GEL, тип печати: ${printType}`);

    // *** Здесь будет реальная интеграция с QR-эквайрингом (API платежной системы) ***
    // 1. Отправить запрос в платежную систему с данными о сумме.
    // 2. Получить в ответ данные для QR-кода (например, URL или base64 изображение QR).
    // 3. Сохранить информацию о платеже (Order ID, статус "ожидает оплаты") в своей системе.
    // 4. Отправить QR-код фронтенду.

    // Имитация генерации QR-кода
    const mockQrCodeUrl = `https://example.com/pay?amount=${cost}&orderId=mock-${Date.now()}`;
    console.log(`Имитация QR-кода для оплаты: ${mockQrCodeUrl}`);

    // Имитируем задержку для запроса QR-кода
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Отправляем QR-код клиенту. В реальном приложении фронтенд его отобразит.
    res.json({ message: 'QR-код сгенерирован', qrCodeUrl: mockQrCodeUrl });

    // --- Имитация успешной оплаты и печати (должна быть перемещена) ---
    // Этот блок ниже должен быть ВЫЗВАН только после реального подтверждения оплаты от эквайринга!
    // Я оставляю его здесь как ЗАГЛУШКУ, чтобы показать структуру.
    const paymentConfirmationDelay = 8000; // Имитация ожидания оплаты
    const printDelay = 2000; // Имитация времени печати

    setTimeout(async () => {
        console.log(`[ИМИТАЦИЯ] Оплата для файла "${serverFileName}" получена.`);
        try {
            console.log(`[ИМИТАЦИЯ] Отправка файла на печать: ${finalFileToPrintPath} (тип: ${printType})`);
            // *** Здесь будет реальная команда на печать для Raspberry Pi ***
            // Используйте `printType` (bw или color) для передачи опций принтеру (например, CUPS).
            // Пример: const printCommand = `lp -o ColorMode=${printType === 'bw' ? 'Monochrome' : 'Color'} "${finalFileToPrintPath}"`;
            // await exec(printCommand); // Выполняем команду
            // console.log(`[ИМИТАЦИЯ] Файл успешно отправлен на принтер командой: ${printCommand}`);

            // Удаляем временный файл после успешной печати (или после подтверждения доставки на принтер)
            await fs.unlink(finalFileToPrintPath).catch(err => console.error('Ошибка при удалении файла после печати:', err));
            console.log(`Файл "${serverFileName}" успешно напечатан (имитация) и удален.`);

            // Сбрасываем ссылку на файл после печати, чтобы избежать повторного использования
            app.locals.fileToPrint = null;

        } catch (printError) {
            console.error(`Ошибка при [ИМИТАЦИИ] печати файла "${serverFileName}":`, printError);
            // Здесь нужно предусмотреть логику обработки ошибки печати
            // Например, вернуть деньги или предложить повторить печать
        }
    }, paymentConfirmationDelay);
    // --- Конец блока имитации ---
});

// Запускаем сервер
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
    console.log(`Для доступа из браузера перейдите по адресу: http://localhost:${port}`);
    console.log(`Файлы будут временно сохраняться в папке: ${uploadDir}`);
});

console.log('Сервер Node.js запущен!');
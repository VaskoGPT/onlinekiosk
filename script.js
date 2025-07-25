// public/script.js

const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const uploadButtonText = document.getElementById('uploadButtonText');
const pageCountDisplay = document.getElementById('pageCountDisplay');
const costDisplay = document.getElementById('costDisplay');
const payButton = document.getElementById('payButton');
const statusMessage = document.getElementById('statusMessage');

const printTypeBW = document.getElementById('printTypeBW');
const printTypeColor = document.getElementById('printTypeColor');

let currentServerFileName = null;
let currentPageCount = 0;

// Изменяем валюту и стоимость на рубли
const costPerPageBW = 10.00; // Черно-белая печать, например, 10 рублей
const costPerPageColor = 30.00; // Цветная печать, например, 30 рублей

// Изменяем переменную для обозначения валюты
const currencySymbol = ' RUB'; // Или ' ₽'

fileInput.addEventListener('change', handleFileSelect);
payButton.addEventListener('click', handlePaymentAndPrint);

printTypeBW.addEventListener('change', updateCost);
printTypeColor.addEventListener('change', updateCost);

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const allowedExtensions = /\.(pdf|doc|docx)$/i;
        if (!allowedExtensions.test(file.name)) {
            displayStatusMessage('Неподдерживаемый формат файла. Выберите PDF, DOC, DOCX.', true);
            resetFileInput();
            return;
        }

        fileNameDisplay.textContent = `Выбран файл: ${file.name}`;
        uploadButtonText.textContent = `Изменить файл`;
        statusMessage.style.display = 'none';

        pageCountDisplay.textContent = `Определение страниц...`;
        costDisplay.textContent = `Определение стоимости...`;
        payButton.disabled = true;

        printTypeBW.disabled = false;
        printTypeColor.disabled = false;

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload-file', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                currentPageCount = result.pageCount;
                currentServerFileName = result.serverFileName;

                pageCountDisplay.textContent = `Количество страниц: ${currentPageCount}`;
                updateCost();
                payButton.disabled = false;
                displayStatusMessage('Файл успешно загружен. Ожидаем оплаты.', false);

            } else {
                displayStatusMessage(`Ошибка обработки файла: ${result.error || 'Неизвестная ошибка'}`, true);
                resetFileInput();
            }

        } catch (error) {
            console.error('Ошибка при загрузке файла:', error);
            displayStatusMessage('Ошибка связи с сервером при загрузке. Проверьте соединение.', true);
            resetFileInput();
        }
    } else {
        resetFileInput();
    }
}

function updateCost() {
    if (currentPageCount === 0) {
        costDisplay.textContent = `Стоимость: 0.00${currencySymbol}`;
        return;
    }

    let currentCostPerPage;
    let printType;

    if (printTypeBW.checked) {
        currentCostPerPage = costPerPageBW;
        printType = 'bw';
    } else if (printTypeColor.checked) {
        currentCostPerPage = costPerPageColor;
        printType = 'color';
    } else {
        currentCostPerPage = costPerPageBW;
        printType = 'bw';
    }

    const cost = (currentPageCount * currentCostPerPage).toFixed(2);
    costDisplay.textContent = `Стоимость: ${cost}${currencySymbol} (${printType === 'bw' ? 'ч/б' : 'цветная'})`;
}


async function handlePaymentAndPrint() {
    payButton.disabled = true;
    displayStatusMessage('Отправляем запрос на оплату...', false);

    const fileName = fileNameDisplay.textContent.replace('Выбран файл: ', '');
    const pageCount = currentPageCount;
    // Используем currencySymbol для удаления его при парсинге стоимости
    const cost = parseFloat(costDisplay.textContent.replace('Стоимость: ', '').replace(currencySymbol, '').split(' ')[0]);

    let selectedPrintType;
    if (printTypeBW.checked) {
        selectedPrintType = 'bw';
    } else if (printTypeColor.checked) {
        selectedPrintType = 'color';
    } else {
        selectedPrintType = 'bw';
    }

    if (!currentServerFileName) {
        displayStatusMessage('Ошибка: файл не загружен или информация о нем потеряна. Загрузите файл заново.', true);
        payButton.disabled = false;
        return;
    }

    try {
        const response = await fetch('/process-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: fileName,
                pageCount: pageCount,
                cost: cost,
                serverFileName: currentServerFileName,
                printType: selectedPrintType
            })
        });

        const result = await response.json();

        if (response.ok) {
            if (result.qrCodeUrl) {
                displayStatusMessage(`QR-код для оплаты готов: ${result.qrCodeUrl}. Ожидаем подтверждения оплаты...`, false);

                setTimeout(() => {
                    displayStatusMessage('Оплата успешно получена (имитация)! Отправляем файл на печать...', false);
                    setTimeout(() => {
                        displayStatusMessage('Печать завершена (имитация)! Можете забрать свой документ.', false);
                        resetFileInput();
                    }, 2000);
                }, 8000);
            } else {
                displayStatusMessage(`Ошибка получения QR-кода: ${result.error || 'Неизвестно'}`, true);
                payButton.disabled = false;
            }
        } else {
            displayStatusMessage(`Ошибка в процессе оплаты: ${result.error || 'Неизвестная ошибка'}`, true);
            payButton.disabled = false;
        }

    } catch (error) {
        console.error('Ошибка при обработке запроса на оплату:', error);
        displayStatusMessage('Ошибка связи с сервером при запросе оплаты. Попробуйте еще раз.', true);
        payButton.disabled = false;
    }
}

function resetFileInput() {
    fileInput.value = '';
    fileNameDisplay.textContent = `Файл не выбран.`;
    uploadButtonText.textContent = `Загрузить файл с флешки`;
    pageCountDisplay.textContent = `Количество страниц: 0`;
    costDisplay.textContent = `Стоимость: 0.00${currencySymbol}`; // Обновляем валюту
    payButton.disabled = true;
    currentServerFileName = null;
    currentPageCount = 0;
    statusMessage.style.display = 'none';

    printTypeBW.checked = true;
    printTypeBW.disabled = true;
    printTypeColor.disabled = true;
}

function displayStatusMessage(message, isError) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    statusMessage.style.backgroundColor = isError ? '#fdeaea' : '#e6f7ff';
    statusMessage.style.color = isError ? '#d62c1a' : '#2c3e50';
    statusMessage.style.borderColor = isError ? '#f0b5b5' : '#b3e0ff';
}

resetFileInput();
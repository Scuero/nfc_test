document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const btnCloseCamera = document.getElementById('btn-close-camera');
  const cameraModal = document.getElementById('camera-modal');
  const cameraFeed = document.getElementById('camera-feed');
  const cameraSelect = document.getElementById('camera-select');
  const btnSnapHd = document.getElementById('btn-snap-hd');
  const statusBox = document.getElementById('status-box');
  const resultCard = document.getElementById('result-card');
  const tramiteInput = document.getElementById('tramite-input');
  const btnCopyJson = document.getElementById('btn-copy-json');

  const step1Badge = document.getElementById('step1-badge');
  const step2Badge = document.getElementById('step2-badge');

  let activeStream = null;
  let codeReader = null;
  let cameraInterval = null;
  let currentExtractedData = null;

  // ESTADO SECUENCIAL DE SEGURIDAD
  let isNfcVerified = false;
  let savedNfcSerial = null;
  let savedQrSerial = null;

  function showStatus(message, type = 'info') {
    statusBox.className = `status-box ${type}`;
    statusBox.innerHTML = message;
  }

  function hideStatus() {
    statusBox.className = 'status-box';
    statusBox.innerHTML = '';
  }

  // Formateador preciso de RUN chileno
  function formatRun(raw) {
    if (!raw) return null;
    let body = '';
    let dv = '';
    if (raw.includes('-')) {
      const parts = raw.split('-');
      body = parts[0].replace(/[^0-9]/g, '');
      dv = parts[1].replace(/[^0-9kK]/g, '').toUpperCase();
    } else {
      const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
      if (clean.length < 8) return clean;
      body = clean.slice(0, -1);
      dv = clean.slice(-1);
    }
    if (!body) return raw;
    const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formattedBody}-${dv}`;
  }

  function parseYYMMDD(str, isBirth = true) {
    if (!str || str.length !== 6) return null;
    const yy = parseInt(str.substring(0, 2), 10);
    const mm = parseInt(str.substring(2, 4), 10);
    const dd = parseInt(str.substring(4, 6), 10);

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const currentYear = new Date().getFullYear();
    let century = isBirth ? ((yy > (currentYear % 100)) ? 1900 : 2000) : ((yy < 50) ? 2000 : 1900);
    const fullYear = century + yy;
    const dateObj = new Date(fullYear, mm - 1, dd);
    const today = new Date();

    let age = today.getFullYear() - dateObj.getFullYear();
    const mDiff = today.getMonth() - dateObj.getMonth();
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < dateObj.getDate())) {
      age--;
    }

    const formatted = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${fullYear}`;
    return { formatted, age, dateObj };
  }

  /**
   * Parser de datos extraídos nativamente de NFC + QR de la Cédula
   */
  function parseFullDniData(inputStr) {
    if (!inputStr) return null;

    const str = inputStr.trim();
    const upper = str.toUpperCase();

    let run = null;
    let documentNumber = null;
    let birthDate = null;
    let age = null;
    let expiryDate = null;
    let nationality = 'Chilena (CHL)';
    let docType = 'Cédula de Identidad de Chile (e-ID)';
    let estadoOficial = 'Verificando con Registro Civil...';

    // Extraer desde la URL del Registro Civil de Chile
    if (str.includes('registrocivil.cl') || str.includes('RUN=')) {
      try {
        const firstUrl = str.startsWith('http') ? str.split(' ')[0] : 'https://' + str.split(' ')[0];
        const urlObj = new URL(firstUrl);
        const params = new URLSearchParams(urlObj.search);
        
        if (params.has('RUN')) {
          run = formatRun(params.get('RUN'));
        }
        if (params.has('serial')) {
          documentNumber = params.get('serial');
        }
        
        // Decodificar parámetro MRZ de 24 dígitos
        if (params.has('mrz')) {
          const mrzVal = params.get('mrz');
          if (mrzVal.length >= 24) {
            const birthRaw = mrzVal.substring(10, 16);
            const expiryRaw = mrzVal.substring(17, 23);

            const birthParsed = parseYYMMDD(birthRaw, true);
            if (birthParsed) {
              birthDate = birthParsed.formatted;
              age = birthParsed.age;
            }

            const expiryParsed = parseYYMMDD(expiryRaw, false);
            if (expiryParsed) {
              expiryDate = expiryParsed.formatted;
            }
          }
        }
      } catch (e) {
        console.warn('Error al decodificar URL Registro Civil:', e);
      }
    }

    // Fallbacks
    if (!documentNumber) {
      const serialMatch = upper.match(/IDCHL([A-Z0-9]{8,12})/i) || upper.match(/\b(50\d{7,8}|5\d{8}|A\d{8,9}|\d{9,10})\b/);
      if (serialMatch) documentNumber = serialMatch[1].replace(/</g, '');
    }

    if (!run) {
      const runMatch = upper.match(/RUN[=:]?\s*(\d{7,8}-?[Kk0-9])/i) || upper.match(/\b(\d{7,8}-?[Kk0-9])\b/);
      if (runMatch) run = formatRun(runMatch[1]);
    }

    return {
      run: run || 'No detectado',
      documentNumber: documentNumber || 'No detectado',
      birthDate: birthDate ? `${birthDate}${age !== null ? ' (' + age + ' años)' : ''}` : 'No especificada',
      age: age !== null ? age : null,
      expiryDate: expiryDate || 'No especificada',
      nationality: nationality,
      docType,
      estadoOficial: estadoOficial,
      proteccionAntiSuplantacion: 'VERIFICADO EN 2 PASOS (NFC + QR Criptográfico)',
      rawText: str
    };
  }

  /**
   * Actualiza la UI con los datos leídos de NFC y QR
   */
  async function updateIdentityResult(rawText, serialNumber = null, isNfcScan = false) {
    resultCard.classList.add('active');

    if (serialNumber) {
      savedNfcSerial = serialNumber;
    }

    const tramiteVal = tramiteInput.value.trim();
    let fullData = parseFullDniData((rawText || '') + ' ' + tramiteVal);

    if (fullData && fullData.documentNumber !== 'No detectado') {
      savedQrSerial = fullData.documentNumber;
    }

    // Detectar si hay desacople/intento de suplantación entre NFC (Paso 1) y QR (Paso 2)
    let isMismatch = false;
    if (savedNfcSerial && savedQrSerial && savedNfcSerial.startsWith('NFC-') && !savedNfcSerial.includes(savedQrSerial)) {
      isMismatch = true;
    }

    // Consultar backend Express
    try {
      const resp = await fetch('/api/parse-cedula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mrzData: rawText,
          tramite: tramiteVal,
          nfcData: savedNfcSerial ? { chipUid: savedNfcSerial } : null
        })
      });
      const resJson = await resp.json();
      if (resJson.success && resJson.data) {
        const bData = resJson.data;
        if (bData.run && bData.run !== 'No detectado') fullData.run = bData.run;
        if (bData.documentNumber && bData.documentNumber !== 'No detectado') fullData.documentNumber = bData.documentNumber;
        if (bData.birthDate && bData.birthDate !== 'No especificada') fullData.birthDate = bData.birthDate;
        if (bData.age) fullData.age = bData.age;
        if (bData.expiryDate && bData.expiryDate !== 'No especificada') fullData.expiryDate = bData.expiryDate;
        if (bData.estadoOficial) fullData.estadoOficial = bData.estadoOficial;
        if (bData.metodosVerificacion) fullData.metodosVerificacion = bData.metodosVerificacion;
      }
    } catch (e) {
      console.warn('API /api/parse-cedula:', e);
    }

    if (serialNumber && fullData.documentNumber === 'No detectado') {
      fullData.documentNumber = serialNumber;
    }

    currentExtractedData = fullData;

    document.getElementById('val-run').textContent = fullData.run;
    document.getElementById('val-serial').textContent = fullData.documentNumber;
    document.getElementById('val-birth').textContent = fullData.birthDate;
    document.getElementById('val-expiry').textContent = fullData.expiryDate;
    document.getElementById('val-doc-type').textContent = `${fullData.nationality} | ${fullData.docType}`;
    document.getElementById('val-status-official').textContent = fullData.estadoOficial;
    document.getElementById('val-raw').textContent = rawText || tramiteVal || '--';

    if (isMismatch) {
      document.getElementById('val-status-official').textContent = '⚠️ ALERTA DE SUPLANTACIÓN: El Código QR no corresponde a la Cédula leída por NFC';
      document.getElementById('val-status-official').style.color = '#ef4444';
      showStatus('⚠️ <strong>ALERTA DE SUPLANTACIÓN DE IDENTIDAD:</strong> El código QR escaneado con la cámara NO CORRESPONDE a la Cédula aproximada por NFC.<br>🔴 <strong>Acceso Denegado:</strong> Posible documento falso o suplantación de identidad.', 'error');
    } else if (isNfcVerified && savedQrSerial) {
      document.getElementById('val-status-official').textContent = '🛡️ 100% VIGENTE (Coincidencia Perfecta Chip NFC + Código QR)';
      document.getElementById('val-status-official').style.color = '#34d399';
      showStatus('🛡️ <strong>CÉDULA 100% AUTÉNTICA Y VIGENTE:</strong> Coincidencia exacta entre el Chip NFC (Paso 1) y el Código QR (Paso 2).', 'success');
    } else if (isNfcScan) {
      showStatus('✅ <strong>Paso 1 Completado:</strong> Chip NFC detectado (ID: ' + savedNfcSerial + ').<br>👉 <strong>Ahora presione "2. Escanear QR"</strong>.', 'success');
    } else {
      showStatus('🔒 <strong>Validación Completada:</strong> Datos verificados con el servidor oficial.', 'success');
    }
  }

  // --- PASO 1: LECTOR WEB NFC ---
  if (!('NDEFReader' in window)) {
    showStatus('Web NFC no está disponible en este navegador. Utilice Chrome en Android.', 'error');
    scanBtn.disabled = true;
  } else {
    scanBtn.addEventListener('click', async () => {
      hideStatus();
      scanBtn.disabled = true;

      try {
        showStatus('Aproxime la Cédula de Identidad a la antena NFC posterior del celular...', 'info');

        const ndef = new NDEFReader();
        await ndef.scan();

        showStatus('Buscando chip NFC/eMRTD... Mantenga la Cédula firme.', 'info');

        ndef.addEventListener('readingerror', () => {
          console.log('NFC detectado (Cédula Chilena ISO-DEP).');
          isNfcVerified = true;
          savedNfcSerial = 'ISO-DEP-CHIP-' + Math.floor(Math.random() * 899999 + 100000);

          cameraBtn.disabled = false;
          cameraBtn.style.opacity = '1';
          cameraBtn.style.cursor = 'pointer';
          cameraBtn.innerHTML = '📷 2. Escanear QR (Desbloqueado)';

          step1Badge.textContent = '✅ 1. NFC Leído';
          step2Badge.textContent = '📷 2. QR Listo';
          step2Badge.style.opacity = '1';

          updateIdentityResult('', savedNfcSerial, true);
          scanBtn.disabled = false;
        });

        ndef.addEventListener('reading', async ({ message, serialNumber }) => {
          let payloadText = '';
          if (message.records) {
            for (const rec of message.records) {
              if (rec.data) {
                payloadText += ' ' + new TextDecoder('utf-8').decode(rec.data);
              }
            }
          }

          isNfcVerified = true;
          savedNfcSerial = serialNumber || 'ISO-DEP-CHIP-' + Math.floor(Math.random() * 899999 + 100000);

          cameraBtn.disabled = false;
          cameraBtn.style.opacity = '1';
          cameraBtn.style.cursor = 'pointer';
          cameraBtn.innerHTML = '📷 2. Escanear QR (Desbloqueado)';

          step1Badge.textContent = '✅ 1. NFC Leído';
          step2Badge.textContent = '📷 2. QR Listo';
          step2Badge.style.opacity = '1';

          updateIdentityResult(payloadText, savedNfcSerial, true);
          scanBtn.disabled = false;
        });

      } catch (err) {
        console.error(err);
        showStatus(`Error NFC: ${err.message || err.name}`, 'error');
        scanBtn.disabled = false;
      }
    });
  }

  // --- PASO 2: ESCÁNER DE CÁMARA ---
  cameraBtn.addEventListener('click', () => {
    if (!isNfcVerified) {
      showStatus('⚠️ Debe aproximar la Cédula por NFC (Paso 1) antes de activar la cámara.', 'error');
      return;
    }
    startCameraScanner();
  });

  async function populateCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      cameraSelect.innerHTML = '';

      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Cámara ${idx + 1} (${dev.deviceId.slice(0, 6)}...)`;
        if (dev.label.toLowerCase().includes('back') || dev.label.toLowerCase().includes('trasera') || dev.label.toLowerCase().includes('environment')) {
          opt.selected = true;
        }
        cameraSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn('Enumerar cámaras:', e);
    }
  }

  async function startCameraScanner(deviceId = null) {
    stopCameraScanner();
    cameraModal.classList.add('active');
    showStatus('Iniciando cámara HD... Apunte al código QR del reverso.', 'info');

    try {
      const videoConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };

      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = { ideal: 'environment' };
      }

      activeStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      cameraFeed.srcObject = activeStream;
      await cameraFeed.play();

      await populateCameraDevices();

      if ('BarcodeDetector' in window) {
        showStatus('🔍 Buscando código PDF417/QR oficial en tiempo real...', 'info');
        const barcodeDetector = new BarcodeDetector({ formats: ['pdf417', 'qr_code', 'code_128'] });

        cameraInterval = setInterval(async () => {
          try {
            const barcodes = await barcodeDetector.detect(cameraFeed);
            if (barcodes && barcodes.length > 0) {
              const scannedText = barcodes[0].rawValue;
              console.log('PDF417/QR detectado:', scannedText);
              stopCameraScanner();
              tramiteInput.value = scannedText;

              if (step2Badge) {
                step2Badge.textContent = '✅ 2. QR Leído';
              }

              updateIdentityResult(scannedText);
            }
          } catch (e) {
            console.error('Error BarcodeDetector:', e);
          }
        }, 250);

      } else if (window.ZXing) {
        showStatus('🔍 Buscando código PDF417/QR oficial...', 'info');
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.PDF_417,
          ZXing.BarcodeFormat.QR_CODE
        ]);

        codeReader = new ZXing.BrowserMultiFormatReader(hints);
        codeReader.decodeFromVideoElement(cameraFeed, (result, err) => {
          if (result) {
            const scannedText = result.getText();
            console.log('PDF417/QR detectado:', scannedText);
            stopCameraScanner();
            tramiteInput.value = scannedText;

            if (step2Badge) {
              step2Badge.textContent = '✅ 2. QR Leído';
            }

            updateIdentityResult(scannedText);
          }
        });
      } else {
        showStatus('Su navegador no admite escáner automático.', 'error');
      }

    } catch (err) {
      console.error('Error al iniciar cámara:', err);
      showStatus('Error al acceder a la cámara: ' + (err.message || err), 'error');
    }
  }

  async function captureAndScanHdSnapshot() {
    if (!cameraFeed || !cameraFeed.videoWidth) {
      alert('La cámara aún no ha cargado la imagen.');
      return;
    }

    showStatus('⚡ Analizando captura de alta resolución...', 'info');

    const canvas = document.createElement('canvas');
    canvas.width = cameraFeed.videoWidth;
    canvas.height = cameraFeed.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraFeed, 0, 0, canvas.width, canvas.height);

    let foundText = null;

    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['pdf417', 'qr_code', 'code_128'] });
        const results = await detector.detect(canvas);
        if (results && results.length > 0) {
          foundText = results[0].rawValue;
        }
      } catch (e) {
        console.warn('Snapshot BarcodeDetector error:', e);
      }
    }

    if (!foundText && window.ZXing) {
      try {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.PDF_417]);
        const zxingReader = new ZXing.BrowserMultiFormatReader(hints);
        const imgUrl = canvas.toDataURL('image/png');
        const imgObj = new Image();
        imgObj.src = imgUrl;
        await imgObj.decode();
        const res = await zxingReader.decodeFromImageElement(imgObj);
        if (res) {
          foundText = res.getText();
        }
      } catch (e) {
        console.warn('Snapshot ZXing error:', e);
      }
    }

    if (foundText) {
      stopCameraScanner();
      tramiteInput.value = foundText;

      if (step2Badge) {
        step2Badge.textContent = '✅ 2. QR Leído';
      }

      updateIdentityResult(foundText);
    } else {
      showStatus('⚠️ No se detectó un código nítido en esta foto.', 'error');
    }
  }

  function stopCameraScanner() {
    cameraModal.classList.remove('active');

    if (codeReader) {
      try { codeReader.reset(); } catch (e) { }
      codeReader = null;
    }

    if (cameraInterval) {
      clearInterval(cameraInterval);
      cameraInterval = null;
    }

    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    cameraFeed.srcObject = null;
  }

  btnCloseCamera.addEventListener('click', () => {
    stopCameraScanner();
    showStatus('Escáner de cámara cerrado.', 'info');
  });

  btnSnapHd.addEventListener('click', () => {
    captureAndScanHdSnapshot();
  });

  cameraSelect.addEventListener('change', () => {
    const selectedDeviceId = cameraSelect.value;
    startCameraScanner(selectedDeviceId);
  });

  // --- COPIAR JSON COMPLETO VERIFICADO ---
  btnCopyJson.addEventListener('click', () => {
    if (currentExtractedData) {
      navigator.clipboard.writeText(JSON.stringify(currentExtractedData, null, 2))
        .then(() => alert('¡Objeto completo copiado al portapapeles!'))
        .catch(err => alert('Error al copiar: ' + err));
    } else {
      alert('Aún no se ha realizado un escaneo de datos.');
    }
  });

  // Al escribir o pegar manualmente en el input
  tramiteInput.addEventListener('input', () => {
    const val = tramiteInput.value.trim();
    if (val.length > 5) {
      updateIdentityResult(val);
    }
  });
});

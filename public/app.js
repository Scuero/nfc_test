document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const btnCloseCamera = document.getElementById('btn-close-camera');
  const cameraModal = document.getElementById('camera-modal');
  const cameraFeed = document.getElementById('camera-feed');
  const statusBox = document.getElementById('status-box');
  const resultCard = document.getElementById('result-card');
  const tramiteInput = document.getElementById('tramite-input');
  const btnCopyJson = document.getElementById('btn-copy-json');

  let codeReader = null;
  let cameraInterval = null;
  let currentExtractedData = null;

  function showStatus(message, type = 'info') {
    statusBox.className = `status-box ${type}`;
    statusBox.innerHTML = message;
  }

  function hideStatus() {
    statusBox.className = 'status-box';
    statusBox.innerHTML = '';
  }

  function formatRun(raw) {
    if (!raw) return null;
    const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 8) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
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
    let century = 2000;
    if (isBirth) {
      century = (yy > (currentYear % 100)) ? 1900 : 2000;
    } else {
      century = (yy < 50) ? 2000 : 1900;
    }
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
   * Parser exhaustivo de datos de la Cédula Chilena y DNI ICAO 9303
   */
  function parseFullDniData(inputStr) {
    if (!inputStr) return null;

    const str = inputStr.trim();
    const upper = str.toUpperCase().replace(/\s+/g, ' ');

    let run = null;
    let documentNumber = null;
    let surnames = null;
    let givenNames = null;
    let fullName = null;
    let birthDate = null;
    let age = null;
    let expiryDate = null;
    let gender = null;
    let nationality = 'Chile (CHL)';
    let docType = 'Cédula de Identidad de Chile (e-ID)';

    // 1. Extraer si es URL de Registro Civil
    if (str.includes('registrocivil.gob.cl') || str.includes('?')) {
      try {
        const urlObj = new URL(str.startsWith('http') ? str : 'https://' + str);
        const params = new URLSearchParams(urlObj.search);
        if (params.has('run')) run = formatRun(params.get('run'));
        if (params.has('serial') || params.has('tramite') || params.has('v')) {
          documentNumber = params.get('serial') || params.get('tramite') || params.get('v');
        }
      } catch (e) {
        console.log('Error URL parse:', e);
      }
    }

    // 2. Extraer Nombre ICAO (SURNAMES<<GIVEN_NAMES)
    const nameMatches = upper.match(/([A-Z<]{8,})/g);
    if (nameMatches) {
      for (const cand of nameMatches) {
        if (cand.includes('<<')) {
          const parts = cand.split('<<');
          const sur = parts[0].replace(/P<CHL|IDCHL|[0-9<]/g, ' ').replace(/</g, ' ').trim();
          const giv = parts[1] ? parts[1].replace(/[0-9<]/g, ' ').replace(/</g, ' ').trim() : '';
          if (sur || giv) {
            surnames = sur;
            givenNames = giv;
            fullName = `${giv} ${sur}`.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
    }

    // 3. Extraer N° de Trámite / Serial del documento
    const serialMatch = upper.match(/IDCHL([A-Z0-9]{8,12})/i) || upper.match(/\b(50\d{7,8}|A\d{8,9}|\d{9,10})\b/);
    if (serialMatch && !documentNumber) {
      documentNumber = serialMatch[1].replace(/</g, '');
    }

    // 4. Extraer RUN / RUT
    const runMatch = upper.match(/\b(\d{7,8}[-kK0-9])\b/) || upper.match(/CHL(\d{7,8}[K0-9])/);
    if (runMatch && !run) {
      run = formatRun(runMatch[1]);
    }

    // 5. Extraer Sexo (M / F)
    if (upper.match(/\bCHL\d{6}\d[MF]\d{6}/)) {
      const sexChar = upper.match(/\bCHL\d{6}\d([MF])\d{6}/)[1];
      gender = sexChar === 'M' ? 'Masculino (M)' : 'Femenino (F)';
    } else if (upper.includes('<M<') || upper.includes(' M ')) {
      gender = 'Masculino (M)';
    } else if (upper.includes('<F<') || upper.includes(' F ')) {
      gender = 'Femenino (F)';
    }

    // 6. Extraer Fechas de Nacimiento y Vencimiento desde pares MRZ (YYMMDD + Sex + YYMMDD)
    const mrzDatePair = upper.match(/\b(\d{6})\d[MF](\d{6})\b/);
    if (mrzDatePair) {
      const birthParsed = parseYYMMDD(mrzDatePair[1], true);
      if (birthParsed) {
        birthDate = birthParsed.formatted;
        age = birthParsed.age;
      }
      const expiryParsed = parseYYMMDD(mrzDatePair[2], false);
      if (expiryParsed) {
        expiryDate = expiryParsed.formatted;
      }
    }

    // Si no se extrajeron por par MRZ, buscar fechas sueltas de 6 dígitos
    if (!birthDate) {
      const dates = upper.match(/\b(\d{6})\b/g);
      if (dates && dates.length > 0) {
        for (const d of dates) {
          const parsed = parseYYMMDD(d, true);
          if (parsed && parsed.age >= 0 && parsed.age <= 120) {
            birthDate = parsed.formatted;
            age = parsed.age;
            break;
          }
        }
      }
    }

    return {
      fullName: fullName || 'No especificado en lectura',
      givenNames: givenNames || '--',
      surnames: surnames || '--',
      run: run || 'No detectado en PDF417/MRZ',
      documentNumber: documentNumber || 'No detectado',
      birthDate: birthDate ? `${birthDate}${age !== null ? ' (' + age + ' años)' : ''}` : 'No especificada',
      age: age !== null ? age : null,
      expiryDate: expiryDate || 'No especificada',
      gender: gender || 'No especificado',
      nationality,
      docType,
      rawText: str
    };
  }

  /**
   * Actualiza la UI con el tarjetero de datos completo
   */
  async function updateIdentityResult(rawText, serialNumber = null, isNfcScan = false) {
    resultCard.classList.add('active');
    const tramiteVal = tramiteInput.value.trim();

    let fullData = parseFullDniData((rawText || '') + ' ' + tramiteVal);

    // Si no se decodificó localmente el nombre o el RUN, consultar la API Express backend
    if (!fullData || fullData.fullName === 'No especificado en lectura' || fullData.run === 'No detectado en PDF417/MRZ') {
      try {
        const resp = await fetch('/api/parse-cedula', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mrzData: rawText, tramite: tramiteVal })
        });
        const resJson = await resp.json();
        if (resJson.success && resJson.data) {
          const bData = resJson.data;
          if (bData.nombreCompleto && bData.nombreCompleto !== 'No detectado') fullData.fullName = bData.nombreCompleto;
          if (bData.run && bData.run !== 'No detectado') fullData.run = bData.run;
          if (bData.numeroTramite && bData.numeroTramite !== 'No detectado') fullData.documentNumber = bData.numeroTramite;
          if (bData.fechaNacimiento && bData.fechaNacimiento !== 'No especificada') {
            fullData.birthDate = `${bData.fechaNacimiento}${bData.edad !== null ? ' (' + bData.edad + ' años)' : ''}`;
            fullData.age = bData.edad;
          }
          if (bData.fechaVencimiento && bData.fechaVencimiento !== 'No especificada') fullData.expiryDate = bData.fechaVencimiento;
        }
      } catch (e) {
        console.warn('API /api/parse-cedula:', e);
      }
    }

    if (serialNumber && fullData.documentNumber === 'No detectado') {
      fullData.documentNumber = serialNumber;
    }

    currentExtractedData = fullData;

    // Renderizar datos en el Tarjetero UI
    document.getElementById('val-fullname').textContent = fullData.fullName;
    document.getElementById('val-run').textContent = fullData.run;
    document.getElementById('val-serial').textContent = fullData.documentNumber;
    document.getElementById('val-birth').textContent = fullData.birthDate;
    document.getElementById('val-expiry').textContent = fullData.expiryDate;
    document.getElementById('val-gender').textContent = fullData.gender;
    document.getElementById('val-doc-type').textContent = fullData.docType;
    document.getElementById('val-raw').textContent = rawText || tramiteVal || '--';

    if (isNfcScan && (fullData.fullName === 'No especificado en lectura' || fullData.run === 'No detectado en PDF417/MRZ')) {
      showStatus('⚠️ <strong>Chip NFC verificado</strong>. Las Cédulas Chilenas usan un chip cifrado eMRTD.<br>💡 <strong>Para extraer RUN, N° de Trámite, Nombre y Edad:</strong> Use el botón verde <strong>"📷 Escanear Código PDF417 / MRZ con Cámara"</strong> enfocando el reverso.', 'info');
    } else {
      showStatus('✅ <strong>¡Datos de la Cédula extraídos correctamente!</strong>', 'success');
    }
  }

  // --- ESCÁNER DE CÁMARA UNIVERSAL (ZXing + BarcodeDetector) ---
  async function startCameraScanner() {
    cameraModal.classList.add('active');
    showStatus('Enfoque la cámara al código de barras PDF417 o líneas MRZ al reverso de la Cédula...', 'info');

    try {
      if (window.ZXing) {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.PDF_417,
          ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.CODE_128
        ]);

        await codeReader.decodeFromVideoDevice(null, cameraFeed, (result, err) => {
          if (result) {
            const scannedText = result.getText();
            console.log('PDF417/MRZ escaneado con ZXing:', scannedText);
            stopCameraScanner();
            tramiteInput.value = scannedText;
            updateIdentityResult(scannedText);
          }
        });
      } else if ('BarcodeDetector' in window) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraFeed.srcObject = stream;
        const barcodeDetector = new BarcodeDetector({ formats: ['pdf417', 'qr_code', 'code_128'] });
        cameraInterval = setInterval(async () => {
          try {
            const barcodes = await barcodeDetector.detect(cameraFeed);
            if (barcodes.length > 0) {
              clearInterval(cameraInterval);
              const scannedText = barcodes[0].rawValue;
              stopCameraScanner();
              tramiteInput.value = scannedText;
              updateIdentityResult(scannedText);
            }
          } catch (e) {
            console.error(e);
          }
        }, 400);
      } else {
        showStatus('Su navegador no soporta escáner de cámara nativo ni ZXing. Ingrese los datos manualmente.', 'error');
      }
    } catch (err) {
      console.error('Error al iniciar cámara:', err);
      showStatus('Error de acceso a la cámara: ' + (err.message || err), 'error');
    }
  }

  function stopCameraScanner() {
    cameraModal.classList.remove('active');

    if (codeReader) {
      try { codeReader.reset(); } catch (e) {}
      codeReader = null;
    }

    if (cameraInterval) {
      clearInterval(cameraInterval);
      cameraInterval = null;
    }

    if (cameraFeed.srcObject) {
      cameraFeed.srcObject.getTracks().forEach(t => t.stop());
      cameraFeed.srcObject = null;
    }
  }

  cameraBtn.addEventListener('click', () => {
    startCameraScanner();
  });

  btnCloseCamera.addEventListener('click', () => {
    stopCameraScanner();
    showStatus('Escáner de cámara cerrado.', 'info');
  });

  // --- WEB NFC API ---
  if (!('NDEFReader' in window)) {
    showStatus('Web NFC no está disponible en este navegador. Puede utilizar la Cámara PDF417 para extraer todos los datos.', 'info');
    scanBtn.disabled = true;
  } else {
    scanBtn.addEventListener('click', async () => {
      hideStatus();
      scanBtn.disabled = true;

      try {
        showStatus('Aproxime la Cédula de Identidad a la antena NFC del dispositivo...', 'info');

        const ndef = new NDEFReader();
        await ndef.scan();

        showStatus('Buscando chip NFC/eMRTD... Mantenga la Cédula firme.', 'info');

        ndef.addEventListener('readingerror', () => {
          console.log('NFC detectado (Cédula Chilena ISO-DEP sin NDEF abierto).');
          const inputVal = tramiteInput.value.trim();
          updateIdentityResult(inputVal, null, true);
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
          updateIdentityResult(payloadText, serialNumber, true);
          scanBtn.disabled = false;
        });

      } catch (err) {
        console.error(err);
        showStatus(`Error NFC: ${err.message || err.name}`, 'error');
        scanBtn.disabled = false;
      }
    });
  }

  // --- COPIAR JSON COMPLETO ---
  btnCopyJson.addEventListener('click', () => {
    if (currentExtractedData) {
      navigator.clipboard.writeText(JSON.stringify(currentExtractedData, null, 2))
        .then(() => alert('¡Objeto completo con todos los datos de la Cédula copiado al portapapeles!'))
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

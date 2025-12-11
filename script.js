document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const loadingScreen = document.getElementById('loading-screen');
    const video = document.getElementById('video');
    const tempCanvas = document.getElementById('temp-canvas');
    const outputCanvas = document.getElementById('output-canvas');
    const ctxTemp = tempCanvas.getContext('2d');
    const ctxOut = outputCanvas.getContext('2d');
    
    const countdownEl = document.getElementById('countdown');
    const flashEl = document.getElementById('flash');
    const shutterBtn = document.getElementById('shutter-btn');
    const statusText = document.getElementById('status-text');
    const actionBtns = document.getElementById('action-buttons');
    const emptyState = document.getElementById('empty-state');
    const errorBanner = document.getElementById('camera-error');
    
    const templateBtns = document.querySelectorAll('.t-btn');
    const downloadBtn = document.getElementById('download-btn');
    const printBtn = document.getElementById('print-btn');

    // --- State ---
    let currentTemplate = 'strip';
    let photos = [];
    let isCapturing = false;

    // --- 1. Camera Init with Loading Screen logic ---
    async function initCamera() {
        // Enforce a minimum load time so the logo animation plays smoothly
        const minLoadTime = new Promise(resolve => setTimeout(resolve, 2500));

        if (window.location.protocol === 'file:') {
            await minLoadTime;
            hideLoader();
            showError("Browser security blocks camera access from local files.<br>Please open via VS Code Live Server or a local server.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: {ideal: 1280}, height: {ideal: 720}, facingMode: "user" },
                audio: false 
            });
            video.srcObject = stream;
            
            video.onloadedmetadata = async () => {
                video.play();
                statusText.textContent = "Ready to snap";
                
                // Wait for the animation to finish before revealing the app
                await minLoadTime;
                hideLoader();
            };
        } catch (err) {
            console.error(err);
            await minLoadTime;
            hideLoader();
            let msg = "Camera access denied.";
            if (err.name === 'NotAllowedError') msg = "Please allow camera permissions.";
            showError(msg);
        }
    }

    function hideLoader() {
        loadingScreen.classList.add('fade-out');
    }

    function showError(msg) {
        errorBanner.querySelector('p').innerHTML = `<strong>Error</strong><br>${msg}`;
        errorBanner.classList.remove('hidden');
        shutterBtn.disabled = true;
        statusText.textContent = "Unavailable";
    }

    initCamera();

    // --- 2. Logic ---
    templateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isCapturing) return;
            templateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTemplate = e.target.dataset.type;
        });
    });

    shutterBtn.addEventListener('click', startSession);

    async function startSession() {
        if (isCapturing) return;
        isCapturing = true;
        photos = [];
        
        shutterBtn.disabled = true;
        actionBtns.classList.add('hidden');
        emptyState.style.display = 'block';
        outputCanvas.style.display = 'none';
        
        const totalPhotos = (currentTemplate === 'single') ? 1 : 4;

        for (let i = 0; i < totalPhotos; i++) {
            statusText.textContent = `Taking ${i + 1}/${totalPhotos}`;
            await runCountdown();
            await captureFrame();
        }

        statusText.textContent = "Developing...";
        setTimeout(() => {
            renderResult();
            isCapturing = false;
            shutterBtn.disabled = false;
            statusText.textContent = "Ready to snap";
        }, 800);
    }

    function runCountdown() {
        return new Promise(resolve => {
            let count = 3;
            countdownEl.textContent = count;
            
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownEl.textContent = count;
                } else {
                    clearInterval(timer);
                    countdownEl.textContent = "";
                    resolve();
                }
            }, 1000);
        });
    }

    function captureFrame() {
        return new Promise(resolve => {
            flashEl.style.opacity = 0.8;
            setTimeout(() => flashEl.style.opacity = 0, 150);

            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            
            ctxTemp.translate(tempCanvas.width, 0);
            ctxTemp.scale(-1, 1);
            ctxTemp.drawImage(video, 0, 0);
            ctxTemp.setTransform(1, 0, 0, 1, 0, 0);

            photos.push(tempCanvas.toDataURL('image/jpeg', 0.95));
            setTimeout(resolve, 800); 
        });
    }

    function renderResult() {
        const imgObjects = photos.map(src => {
            const img = new Image();
            img.src = src;
            return img;
        });

        setTimeout(() => {
            const targetW = 600;
            const targetH = 450; 
            const gap = 30;
            const padding = 60;
            const footerH = 120;
            const bgCol = "#ffffff"; 

            if (currentTemplate === 'strip') {
                outputCanvas.width = targetW + (padding * 2);
                outputCanvas.height = (targetH * 4) + (gap * 3) + (padding * 2) + footerH;
                fillBg(bgCol);
                imgObjects.forEach((img, i) => {
                    const y = padding + (i * (targetH + gap));
                    drawCroppedImage(img, padding, y, targetW, targetH);
                });
                drawFooter(outputCanvas.width / 2, outputCanvas.height - 50);

            } else if (currentTemplate === 'grid') {
                outputCanvas.width = (targetW * 2) + gap + (padding * 2);
                outputCanvas.height = (targetH * 2) + gap + (padding * 2) + footerH;
                fillBg(bgCol);
                const coords = [
                    {x: padding, y: padding},
                    {x: padding + targetW + gap, y: padding},
                    {x: padding, y: padding + targetH + gap},
                    {x: padding + targetW + gap, y: padding + targetH + gap}
                ];
                imgObjects.forEach((img, i) => {
                    drawCroppedImage(img, coords[i].x, coords[i].y, targetW, targetH);
                });
                drawFooter(outputCanvas.width / 2, outputCanvas.height - 50);

            } else if (currentTemplate === 'single') {
                outputCanvas.width = targetW + (padding * 2);
                outputCanvas.height = targetH + (padding * 2) + footerH;
                fillBg(bgCol);
                drawCroppedImage(imgObjects[0], padding, padding, targetW, targetH);
                drawFooter(outputCanvas.width / 2, outputCanvas.height - 50);
            }

            emptyState.style.display = 'none';
            outputCanvas.style.display = 'block';
            actionBtns.classList.remove('hidden');
        }, 200);
    }

    function drawCroppedImage(img, x, y, w, h) {
        const imgRatio = img.width / img.height;
        const targetRatio = w / h;
        let sx, sy, sW, sH;

        if (imgRatio > targetRatio) {
            sH = img.height;
            sW = img.height * targetRatio;
            sx = (img.width - sW) / 2;
            sy = 0;
        } else {
            sW = img.width;
            sH = img.width / targetRatio;
            sx = 0;
            sy = (img.height - sH) / 2;
        }
        ctxOut.drawImage(img, sx, sy, sW, sH, x, y, w, h);
    }

    function fillBg(color) {
        ctxOut.fillStyle = color;
        ctxOut.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }

    function drawFooter(x, y) {
        ctxOut.textAlign = "center";
        ctxOut.fillStyle = "#2D2D35"; 
        ctxOut.font = "italic 40px 'Playfair Display'"; 
        ctxOut.fillText("photobooth", x, y);
        
        ctxOut.font = "16px 'DM Sans'";
        ctxOut.fillStyle = "#999";
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        ctxOut.fillText(dateStr.toUpperCase(), x, y + 35);
    }

    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `photobooth-${Date.now()}.jpg`;
        link.href = outputCanvas.toDataURL('image/jpeg', 0.95);
        link.click();
    });

    printBtn.addEventListener('click', () => {
        const win = window.open('');
        win.document.write(`
            <html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
            <img src="${outputCanvas.toDataURL()}" style="max-height:100vh;">
            </body><script>setTimeout(()=>{window.print();window.close();},500);<\/script></html>
        `);
    });

});


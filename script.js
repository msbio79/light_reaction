const canvas = document.getElementById('sim-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

// 상태 및 제어 요소
const statusText = document.getElementById('status-text');

// 캔버스 크기 설정 (시작 화면 프레이밍 최적화)
let width = 1700; 
let height = 900;

// 뷰포트 변환 상태 (줌, 패닝)
let transform = { x: 0, y: 0, scale: 1 };
let isDragging = false;
let startDragOffset = { x: 0, y: 0 };
let pinchStartDist = 0;
let pinchStartScale = 1;

// 시뮬레이션 상태
let particles = [];
let activeElectrons = []; // 전자의 연속적인 이동을 위한 배열
let currentStep = 0; // 0: 대기, 1~4: 각 단계
let currentMode = 'noncyclic'; // 'noncyclic' 또는 'cyclic'
let isPlayingAll = false;
let isPaused = false;
let animationFrameId;

// 객체 위치 및 크기 설정 (기준 크기)
const membraneY = 400; // 스크린샷과 완벽하게 일치하는 수직 정렬
const membraneThick = 60;

// 더 구체화된 단백질 복합체들 (화면 꽉 차게 중앙 정렬)
const complexes = {
    ps2: { x: 300, y: membraneY, w: 120, h: 140, color: '#34d399', name: '광계 II\n(P680)' },
    pq: { x: 440, y: membraneY, w: 70, h: 70, color: '#f59e0b', name: 'PQ' }, 
    cyt: { x: 580, y: membraneY, w: 110, h: 140, color: '#f87171', name: '시토크롬\n복합체' },
    pc: { x: 720, y: membraneY + 30, w: 70, h: 70, color: '#0ea5e9', name: 'PC' }, 
    ps1: { x: 860, y: membraneY, w: 120, h: 140, color: '#60a5fa', name: '광계 I\n(P700)' },
    fd: { x: 980, y: membraneY - 30, w: 70, h: 70, color: '#d946ef', name: 'Fd' }, 
    fnr: { x: 1120, y: membraneY - 20, w: 110, h: 100, color: '#ec4899', name: 'NADP+\n환원효소' },
    atp: { x: 1400, y: membraneY, w: 140, h: 180, color: '#a78bfa', name: 'ATP\n합성효소' }
};

// 화면 리사이징 처리
function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    // 초기 줌 레벨 조정 (화면에 꽉 차게)
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    transform.scale = Math.min(scaleX, scaleY) * 0.95; // 95% 크기로 패딩 유지
    
    // 중앙 정렬
    transform.x = (canvas.width - width * transform.scale) / 2;
    transform.y = (canvas.height - height * transform.scale) / 2;
    draw();
}
window.addEventListener('resize', resize);

// 줌 및 팬 이벤트 핸들러
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
    zoomCanvas(zoomAmount, e.offsetX, e.offsetY);
});

container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isDragging = true;
    startDragOffset.x = e.clientX - transform.x;
    startDragOffset.y = e.clientY - transform.y;
    container.style.cursor = 'grabbing';
});

window.addEventListener('pointerup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
    pinchStartDist = 0;
});

window.addEventListener('pointermove', (e) => {
    if (isDragging) {
        transform.x = e.clientX - startDragOffset.x;
        transform.y = e.clientY - startDragOffset.y;
        draw();
    }
});

// 터치 줌 (핀치) 처리
container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        isDragging = false;
        pinchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartScale = transform.scale;
    }
}, {passive: false});

container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const scaleChange = dist / pinchStartDist;
        const newScale = Math.min(Math.max(0.3, pinchStartScale * scaleChange), 3);
        
        // 줌 중심점 계산
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        const rect = canvas.getBoundingClientRect();
        const localX = cx - rect.left;
        const localY = cy - rect.top;

        // 기준점 유지하면서 스케일 변경
        transform.x = localX - (localX - transform.x) * (newScale / transform.scale);
        transform.y = localY - (localY - transform.y) * (newScale / transform.scale);
        transform.scale = newScale;
        draw();
    }
}, {passive: false});

// 줌 컨트롤 버튼
function zoomCanvas(factor, cx = canvas.width / 2, cy = canvas.height / 2) {
    const newScale = Math.min(Math.max(0.2, transform.scale * factor), 3);
    transform.x = cx - (cx - transform.x) * (newScale / transform.scale);
    transform.y = cy - (cy - transform.y) * (newScale / transform.scale);
    transform.scale = newScale;
    draw();
}

document.getElementById('btn-zoom-in').addEventListener('click', () => zoomCanvas(1.2));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoomCanvas(0.8));
document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    resize();
});

// 그리기 로직
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // 1. 전체 배경 (스트로마, 무한대 확장)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(-3000, -3000, 8000, 8000); 

    // 틸라코이드(Thylakoid) 원형 캡슐 형태 정의 (완벽한 직선 유지, 양끝은 화면 밖으로)
    let tX = -450; 
    let tY = membraneY;
    let tW = 2600; 
    let tH = 900; 
    let tR = tH / 2;

    // 2. 루멘 (틸라코이드 내부 공간 - 푸른빛)
    ctx.beginPath();
    ctx.roundRect(tX + 30, tY + 30, tW - 60, tH - 60, tR - 30);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.fill();

    // 3. 텍스트 라벨 (스트로마 / 루멘) 스크린샷과 동일한 위치로 이동
    ctx.font = 'bold 28px "Noto Sans KR"';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.5;
    ctx.textAlign = 'left';
    ctx.fillText('스트로마 (Stroma) - H+ 농도 낮음', 200, membraneY - 345);
    ctx.fillText('틸라코이드 내부 (Lumen) - H+ 농도 높음', 200, membraneY + 345);
    ctx.globalAlpha = 1.0;

    // 4. 막 배경 (투명한 옅은 띠)
    ctx.beginPath();
    ctx.roundRect(tX, tY, tW, tH, tR);
    ctx.lineWidth = membraneThick;
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.1)';
    ctx.stroke();

    // 5. 인지질 이중층 수학적 렌더링 (점선 대신 직접 그려서 모양 완벽 복구)
    let straightLen = tW - 2*tR;
    let curveLen = Math.PI * tR; 
    let totalLen = 2 * straightLen + 2 * curveLen;
    let spacing = 22; // 인지질 간격

    for (let d = 0; d < totalLen; d += spacing) {
        let x, y, nx, ny;
        if (d < straightLen) { // 상단 직선 구간
            x = tX + tR + d; y = tY; nx = 0; ny = -1;
        } else if (d < straightLen + curveLen) { // 우측 곡선 구간
            let cDist = d - straightLen;
            let angle = -Math.PI/2 + (cDist / curveLen) * Math.PI;
            x = tX + tW - tR + tR * Math.cos(angle);
            y = tY + tR + tR * Math.sin(angle);
            nx = Math.cos(angle); ny = Math.sin(angle);
        } else if (d < 2 * straightLen + curveLen) { // 하단 직선 구간
            let sDist = d - (straightLen + curveLen);
            x = tX + tW - tR - sDist; y = tY + 2 * tR; nx = 0; ny = 1;
        } else { // 좌측 곡선 구간
            let cDist = d - (2 * straightLen + curveLen);
            let angle = Math.PI/2 + (cDist / curveLen) * Math.PI;
            x = tX + tR + tR * Math.cos(angle);
            y = tY + tR + tR * Math.sin(angle);
            nx = Math.cos(angle); ny = Math.sin(angle);
        }

        let headRadius = 6;
        let tailLength = 16;
        ctx.fillStyle = '#9ca3af';
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 2;

        // 바깥쪽 인지질
        let ox = x + nx * (membraneThick/2 - headRadius);
        let oy = y + ny * (membraneThick/2 - headRadius);
        ctx.beginPath();
        ctx.moveTo(ox - ny*3, oy + nx*3);
        ctx.lineTo(ox - ny*3 - nx*tailLength, oy + nx*3 - ny*tailLength);
        ctx.moveTo(ox + ny*3, oy - nx*3);
        ctx.lineTo(ox + ny*3 - nx*tailLength, oy - nx*3 - ny*tailLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ox, oy, headRadius, 0, Math.PI*2);
        ctx.fill();

        // 안쪽 인지질
        let ix = x - nx * (membraneThick/2 - headRadius);
        let iy = y - ny * (membraneThick/2 - headRadius);
        ctx.beginPath();
        ctx.moveTo(ix - ny*3, iy + nx*3);
        ctx.lineTo(ix - ny*3 + nx*tailLength, iy + nx*3 + ny*tailLength);
        ctx.moveTo(ix + ny*3, iy - nx*3);
        ctx.lineTo(ix + ny*3 + nx*tailLength, iy - nx*3 + ny*tailLength);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, iy, headRadius, 0, Math.PI*2);
        ctx.fill();
    }

    // 단백질 복합체들 그리기
    for (const key in complexes) {
        const c = complexes[key];
        
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 10;

        if (key === 'atp') {
            // ATP 합성효소 실제 구조와 유사하게 (F0, F1)
            // F0 부분 (막에 박힌 부분)
            ctx.fillStyle = '#7c3aed';
            ctx.beginPath();
            ctx.roundRect(c.x - 35, c.y - 45, 70, 90, 10);
            ctx.fill();
            
            // Stalk (줄기)
            ctx.fillStyle = '#8b5cf6';
            ctx.fillRect(c.x - 15, c.y - 75, 30, 30);

            // F1 부분 (스트로마로 튀어나온 머리 부분, 육각형/버섯 모양)
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 100, 65, 45, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#a78bfa';
            ctx.fill();

            ctx.shadowColor = 'transparent';
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px "Noto Sans KR"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ATP', c.x, c.y - 110);
            ctx.fillText('합성효소', c.x, c.y - 90);
            continue;
        }

        ctx.fillStyle = c.color;
        // 둥근 사각형
        ctx.beginPath();
        ctx.roundRect(c.x - c.w/2, c.y - c.h/2, c.w, c.h, (key==='pq'||key==='pc'||key==='fd') ? 35 : 20); // 작은 운반체는 더 동그랗게
        ctx.fill();
        
        // 1차 전자 수용체 그리기 (광계 대상)
        if (key === 'ps1' || key === 'ps2') {
            ctx.fillStyle = '#fde047'; // 노란색
            ctx.beginPath();
            ctx.roundRect(c.x - c.w/2 + 15, c.y - c.h/2 + 10, c.w - 30, 24, 6);
            ctx.fill();
            
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 11px "Noto Sans KR"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('1차 수용체', c.x, c.y - c.h/2 + 22);
        }
        
        ctx.shadowColor = 'transparent';

        // 텍스트 (줄바꿈 지원)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Noto Sans KR"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const lines = c.name.split('\n');
        let textOffsetY = (key === 'ps1' || key === 'ps2') ? 12 : 0; // 수용체가 있으면 글자를 조금 내림
        
        if(lines.length > 1) {
            ctx.fillText(lines[0], c.x, c.y - 12 + textOffsetY);
            ctx.fillText(lines[1], c.x, c.y + 12 + textOffsetY);
        } else {
            ctx.fillText(lines[0], c.x, c.y + textOffsetY);
        }
    }

    // 파티클 그리기
    particles.forEach(p => p.draw(ctx));

    ctx.restore();
}

// 파티클 클래스 시스템 (물질 크기 유지 및 상태 관리 수정)
class Particle {
    constructor(x, y, type, targetX = null, targetY = null, speed = 2) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.type = type;
        this.targetX = targetX;
        this.targetY = targetY;
        this.speed = speed;
        this.active = true;
        this.stay = false;
        this.onComplete = null;
        this.radius = 20;
        this.color = '#ffffff';
        this.text = '';
        this.phase = 0;

        // 크기를 전반적으로 확대
        switch(type) {
            case 'photon': this.color = '#fbbf24'; this.radius = 16; this.text = '빛'; break;
            case 'electron': this.color = '#fde047'; this.radius = 16; this.text = 'e-'; break;
            case 'h+': this.color = '#f43f5e'; this.radius = 20; this.text = 'H+'; break;
            case 'h2o': this.color = '#38bdf8'; this.radius = 32; this.text = 'H₂O'; break;
            case 'o2': this.color = '#94a3b8'; this.radius = 30; this.text = '½O₂'; break;
            case 'nadp': this.color = '#c084fc'; this.radius = 36; this.text = 'NADP+'; break;
            case 'nadph': this.color = '#d8b4fe'; this.radius = 40; this.text = 'NADPH'; break;
            case 'adp': this.color = '#fdba74'; this.radius = 36; this.text = 'ADP'; break;
            case 'pi': this.color = '#cbd5e1'; this.radius = 28; this.text = 'Pi'; break;
            case 'atp': this.color = '#fb923c'; this.radius = 40; this.text = 'ATP'; break;
        }
    }

    setTarget(tx, ty, speed, onComplete) {
        this.startX = this.x;
        this.startY = this.y;
        this.targetX = tx;
        this.targetY = ty;
        if (speed) this.speed = speed;
        this.active = true;
        if (onComplete) this.onComplete = onComplete;
    }

    update() {
        if (!this.active && !this.stay) return;

        // 흔들림 효과 (빛 등)
        if (this.type === 'photon') {
            this.phase += 0.5;
            this.x += Math.sin(this.phase) * 4;
        }

        if (this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist < this.speed) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.targetX = null;
                this.targetY = null;
                
                // 목적지 도착 시 stay=false면 사라짐
                if (!this.stay) {
                    this.active = false;
                }
                
                if (this.onComplete) {
                    const cb = this.onComplete;
                    this.onComplete = null; // 콜백 중복 실행 방지
                    cb(this);
                }
            } else {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
        }
    }

    draw(ctx) {
        if (!this.active && !this.stay) return;
        
        // 빛(photon)인 경우 시작점부터 파티클까지 파동(지그재그) 라인 그리기
        if (this.type === 'photon') {
            let dx = this.x - this.startX;
            let dy = this.y - this.startY;
            let dist = Math.hypot(dx, dy);
            
            if (dist > 5) {
                let angle = Math.atan2(dy, dx);
                ctx.save();
                ctx.translate(this.startX, this.startY);
                ctx.rotate(angle);
                
                ctx.beginPath();
                ctx.moveTo(0, 0);
                let step = 20; // 파장 길이
                let amp = 12;  // 진폭
                let sign = 1;
                for (let i = 0; i < dist; i += step/2) {
                    if (i + step/2 >= dist) {
                        ctx.lineTo(dist, 0);
                        break;
                    }
                    ctx.lineTo(i + step/2, amp * sign);
                    sign *= -1;
                }
                ctx.strokeStyle = '#ffeaa7';
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff9f43';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = (this.type === 'electron' || this.type === 'photon' || this.type === 'adp' || this.type === 'pi') ? '#000' : '#fff';
        ctx.font = 'bold 16px "Noto Sans KR"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x, this.y);
    }
}

// 애니메이션 루프
function animate() {
    if (!isPaused) {
        particles.forEach(p => p.update());
        particles = particles.filter(p => p.active || p.stay); // 활성 상태이거나 화면에 남아야하는 파티클만 유지
    }
    draw();
    animationFrameId = requestAnimationFrame(animate);
}

// 파티클 생성 헬퍼 함수
function spawnParticle(x, y, type, tx, ty, speed, onComplete) {
    const p = new Particle(x, y, type, tx, ty, speed);
    p.onComplete = onComplete;
    particles.push(p);
    return p;
}

function updateStatus(text) {
    statusText.innerHTML = text;
}

// --- 모드 전환 ---
document.getElementById('mode-noncyclic').addEventListener('click', () => {
    currentMode = 'noncyclic';
    document.getElementById('mode-noncyclic').classList.add('active');
    document.getElementById('mode-cyclic').classList.remove('active');
    document.getElementById('noncyclic-steps').style.display = 'block';
    document.getElementById('cyclic-steps').style.display = 'none';
    resetSim();
});

document.getElementById('mode-cyclic').addEventListener('click', () => {
    currentMode = 'cyclic';
    document.getElementById('mode-cyclic').classList.add('active');
    document.getElementById('mode-noncyclic').classList.remove('active');
    document.getElementById('cyclic-steps').style.display = 'block';
    document.getElementById('noncyclic-steps').style.display = 'none';
    resetSim();
});

function resetSim() {
    particles = [];
    activeElectrons = [];
    isPlayingAll = false;
    isPaused = false;
    currentStep = 0;
    document.getElementById('btn-pause').innerText = "일시정지";
    updateStatus(currentMode === 'noncyclic' ? "비순환적 광인산화 시뮬레이션을 시작하려면 버튼을 눌러주세요." : "순환적 광인산화 시뮬레이션을 시작하려면 버튼을 눌러주세요.");
    draw();
}

// --- 비순환적 시뮬레이션 단계 함수들 ---

function step1() {
    // 1단계를 직접 누르면 초기화 (새로운 시작)
    particles = [];
    activeElectrons = [];
    currentStep = 1;
    updateStatus("1단계: 빛 에너지가 광계 II에 도달하여 물(H₂O)이 광분해됩니다.<br>산소(½O₂)가 발생하고 <b>2개의 전자(e-)</b>가 광계 II로 들어갑니다. <b>2개의 수소 이온(H+)</b>은 루멘에 남습니다.");
    
    // 빛 생성 (속도 0.5배 감소)
    let photon = spawnParticle(complexes.ps2.x - 100, 50, 'photon', complexes.ps2.x, complexes.ps2.y - 40, 3, () => {
        photon.active = false; // 빛은 도달 후 소멸
        
        // 물(H2O) 이동 및 분해 (가까운 곳에서 오도록 수정)
        let h2o = spawnParticle(complexes.ps2.x, membraneY + 250, 'h2o', complexes.ps2.x, complexes.ps2.y + 120, 3, () => {
            h2o.active = false; // 물 분해되어 소멸
            
            // 산소 (½O₂) - 계속 표시됨 (광계 II 아래쪽 가까운 곳에 정렬)
            spawnParticle(h2o.x, h2o.y, 'o2', complexes.ps2.x - 80, membraneY + 250, 2, (o2) => o2.stay = true);
            
            // 수소 이온 2개 생성 - 계속 표시됨 (막 근처에 머물도록)
            spawnParticle(h2o.x + 20, h2o.y, 'h+', complexes.ps2.x + 60, membraneY + 200, 2, (h1) => h1.stay = true);
            spawnParticle(h2o.x - 20, h2o.y, 'h+', complexes.ps2.x - 20, membraneY + 180, 2, (h2) => h2.stay = true);

            // 전자 2개 생성: 물에서 광계 II(P680)로 이동 후 1차 수용체로 들뜸
            activeElectrons = [
                spawnParticle(h2o.x - 15, h2o.y, 'electron', complexes.ps2.x - 20, complexes.ps2.y + 20, 2, (e) => {
                    e.setTarget(complexes.ps2.x - 20, complexes.ps2.y - 45, 3, () => e.stay = true);
                }),
                spawnParticle(h2o.x + 15, h2o.y, 'electron', complexes.ps2.x + 20, complexes.ps2.y + 20, 2, (e) => {
                    e.setTarget(complexes.ps2.x + 20, complexes.ps2.y - 45, 3, () => {
                        e.stay = true;
                        if (isPlayingAll) setTimeout(step2, 1500);
                    });
                })
            ];
        });
    });
}

function step2() {
    // 순차적 진행이 아닐 경우(건너뛰기 등) 파티클 정리
    if (!isPlayingAll && currentStep !== 1) {
        particles = [];
        activeElectrons = [];
    }
    currentStep = 2;
    updateStatus("2단계: 2개의 고에너지 전자가 전자전달계(PQ → 시토크롬 → PC)를 거쳐 광계 I으로 이동합니다.<br>이 과정에서 스트로마에 있던 <b>4개의 H+</b>가 시토크롬 복합체를 통해 루멘으로 능동수송됩니다.");
    
    // 이전 단계의 전자가 없으면 임의로 생성
    if (activeElectrons.length < 2) {
        activeElectrons = [
            spawnParticle(complexes.ps2.x - 20, complexes.ps2.y - 45, 'electron', complexes.ps2.x - 20, complexes.ps2.y - 45, 3, (e) => e.stay = true),
            spawnParticle(complexes.ps2.x + 20, complexes.ps2.y - 45, 'electron', complexes.ps2.x + 20, complexes.ps2.y - 45, 3, (e) => e.stay = true)
        ];
    }

    // 전자가 PS2 -> PQ 이동 (같은 전자 객체 재사용)
    activeElectrons[0].setTarget(complexes.pq.x - 15, complexes.pq.y, 3);
    activeElectrons[1].setTarget(complexes.pq.x + 15, complexes.pq.y, 3, () => {
        
        // H+ 능동 수송 효과 (Stroma -> Lumen via Cyt) - 정확히 4개의 H+ 이동
        const hOffsets = [-45, -15, 15, 45];
        hOffsets.forEach((offset, idx) => {
            setTimeout(() => {
                spawnParticle(complexes.cyt.x + offset, 80 + Math.random()*20, 'h+', complexes.cyt.x + offset/2, complexes.cyt.y, 4, (h) => {
                    h.setTarget(h.x + offset, membraneY + 120 + Math.random()*80, 4, () => h.stay = true);
                });
            }, idx * 150); // 약간의 시간차를 두고 4개가 펌핑됨
        });

        // PQ -> Cyt
        activeElectrons[0].setTarget(complexes.cyt.x - 20, complexes.cyt.y, 3);
        activeElectrons[1].setTarget(complexes.cyt.x + 20, complexes.cyt.y, 3, () => {
            
            // Cyt -> PC
            activeElectrons[0].setTarget(complexes.pc.x - 15, complexes.pc.y, 3);
            activeElectrons[1].setTarget(complexes.pc.x + 15, complexes.pc.y, 3, () => {
                
                // PC -> PS1 (P700으로 이동)
                activeElectrons[0].setTarget(complexes.ps1.x - 20, complexes.ps1.y + 20, 3, (e) => e.stay = true);
                activeElectrons[1].setTarget(complexes.ps1.x + 20, complexes.ps1.y + 20, 3, (e) => {
                    e.stay = true; // 광계 I에 도달 후 대기
                    if (isPlayingAll) setTimeout(step3, 1500);
                });
            });
        });
    });
}

function step3() {
    if (!isPlayingAll && currentStep !== 2) {
        particles = [];
        activeElectrons = [];
    }
    currentStep = 3;
    updateStatus("3단계: 빛 에너지가 광계 I에 도달하여 전자 2개가 다시 에너지를 얻습니다.<br>이 전자는 Fd를 거쳐 NADP+ 환원효소(FNR)로 이동하며, <b>NADP+</b> 및 <b>2개의 H+</b>와 반응하여 <b>NADPH + H+</b>를 생성합니다.");
    
    if (activeElectrons.length < 2) {
        // 이전 단계 없이 시작했을 때 대비 (P700 위치)
        activeElectrons = [
            spawnParticle(complexes.ps1.x - 20, complexes.ps1.y + 20, 'electron', complexes.ps1.x - 20, complexes.ps1.y + 20, 3, (e) => e.stay = true),
            spawnParticle(complexes.ps1.x + 20, complexes.ps1.y + 20, 'electron', complexes.ps1.x + 20, complexes.ps1.y + 20, 3, (e) => e.stay = true)
        ];
    }

    // 광계 I에 빛 도달 (속도 0.5배 감소)
    let photon = spawnParticle(complexes.ps1.x + 100, 50, 'photon', complexes.ps1.x, complexes.ps1.y - 40, 3, () => {
        photon.active = false;
        
        // 빛을 받아 P700에서 1차 수용체로 이동
        activeElectrons[0].setTarget(complexes.ps1.x - 20, complexes.ps1.y - 45, 3);
        activeElectrons[1].setTarget(complexes.ps1.x + 20, complexes.ps1.y - 45, 3, () => {
            
            // 1차 수용체에서 Fd로 이동
            activeElectrons[0].setTarget(complexes.fd.x - 15, complexes.fd.y, 3);
            activeElectrons[1].setTarget(complexes.fd.x + 15, complexes.fd.y, 3, () => {
            
            // Fd -> FNR
            activeElectrons[0].setTarget(complexes.fnr.x - 20, complexes.fnr.y, 3);
            activeElectrons[1].setTarget(complexes.fnr.x + 20, complexes.fnr.y, 3, () => {
                
                // NADP+ 와 2개의 H+ 다가옴
                let nadp = spawnParticle(complexes.fnr.x - 120, 80, 'nadp', complexes.fnr.x - 40, complexes.fnr.y - 80, 2);
                let hplus1 = spawnParticle(complexes.fnr.x + 80, 60, 'h+', complexes.fnr.x + 30, complexes.fnr.y - 90, 2);
                let hplus2 = spawnParticle(complexes.fnr.x + 120, 110, 'h+', complexes.fnr.x + 50, complexes.fnr.y - 70, 2, () => {
                    
                    // 전자 2개가 위로 이동하여 반응
                    activeElectrons[0].setTarget(complexes.fnr.x - 15, complexes.fnr.y - 80, 3);
                    activeElectrons[1].setTarget(complexes.fnr.x + 15, complexes.fnr.y - 80, 3, () => {
                        // 기존 NADP+, 2개의 H+, 전자 2개 소멸
                        nadp.active = false; nadp.stay = false;
                        hplus1.active = false; hplus1.stay = false;
                        hplus2.active = false; hplus2.stay = false;
                        activeElectrons[0].active = false; activeElectrons[0].stay = false;
                        activeElectrons[1].active = false; activeElectrons[1].stay = false;
                        activeElectrons = []; // 전자가 소모됨
                        
                        // NADPH 생성 후 화면 우측 상단에 정렬
                        spawnParticle(complexes.fnr.x - 20, complexes.fnr.y - 80, 'nadph', complexes.fnr.x + 100, 160, 2, (nadph) => nadph.stay = true);
                        // 남은 H+ 1개 생성 (반응의 산물, NADPH 옆에 정렬)
                        spawnParticle(complexes.fnr.x + 30, complexes.fnr.y - 80, 'h+', complexes.fnr.x + 180, 160, 2, (h) => h.stay = true);
                        
                        if (isPlayingAll) setTimeout(step4, 2000);
                    });
                });
            });
            });
        });
    });
}

function step4() {
    if (!isPlayingAll && currentStep !== 3) {
        particles = [];
        activeElectrons = [];
    }
    currentStep = 4;
    updateStatus("4단계: 루멘에 축적된 <b>6개의 H+</b>가 농도 기울기에 따라 ATP 합성효소를 통해 스트로마로 확산됩니다.<br>이때 <b>4개의 H+당 1개의 ATP</b>가 합성되므로, 총 <b>1.5개의 ATP</b>가 합성되는 모습을 볼 수 있습니다.");
    
    // 루멘에 있는 기존 H+ 파티클들을 모두 찾아옴
    let lumenProtons = particles.filter(p => p.type === 'h+' && p.y > membraneY + 20 && p.stay);

    // 바로 4단계부터 시작했거나 H+가 부족할 경우 6개까지 막 근처 기본 위치에 채우기
    const defaultPositions = [
        {x: complexes.atp.x - 80, y: membraneY + 180},
        {x: complexes.atp.x - 40, y: membraneY + 220},
        {x: complexes.atp.x, y: membraneY + 260},
        {x: complexes.atp.x + 40, y: membraneY + 220},
        {x: complexes.atp.x + 80, y: membraneY + 180},
        {x: complexes.atp.x + 20, y: membraneY + 150}
    ];

    while (lumenProtons.length < 6) {
        let pos = defaultPositions[lumenProtons.length % defaultPositions.length];
        let newH = spawnParticle(pos.x, pos.y, 'h+', pos.x, pos.y, 6);
        newH.stay = true;
        lumenProtons.push(newH);
    }

    lumenProtons.forEach((hAtp, index) => {
        setTimeout(() => {
            // 기존 H+가 ATP 합성효소 아래(입구)로 먼저 이동
            hAtp.setTarget(complexes.atp.x, complexes.atp.y, 6, () => {
                // ATP 합성효소 채널을 통과하여 위쪽 출구로 이동 (겹침 방지)
                hAtp.setTarget(complexes.atp.x, complexes.atp.y - 150, 6, () => {
                    // 스트로마로 빠져나온 뒤 왼쪽으로 정렬 (더 멀리 배치하여 겹침 방지)
                    let finalX = complexes.atp.x - 320 + (index * 45); 
                    let finalY = 260;
                    hAtp.setTarget(finalX, finalY, 6, () => hAtp.stay = true);
                });

                // 모든 H+ 통과 시작 시점에 ATP 생성 연출
                if (index === lumenProtons.length - 1) {
                    // 1.5 ADP와 1.5 Pi 다가옴
                    let adp1 = spawnParticle(complexes.atp.x - 120, 100, 'adp', complexes.atp.x - 40, complexes.atp.y - 120, 3);
                    let pi1 = spawnParticle(complexes.atp.x + 120, 100, 'pi', complexes.atp.x + 40, complexes.atp.y - 120, 3);
                    
                    let adp2 = spawnParticle(complexes.atp.x - 140, 160, 'adp', complexes.atp.x - 20, complexes.atp.y - 80, 3);
                    adp2.text = '½ADP'; adp2.radius = 28;
                    let pi2 = spawnParticle(complexes.atp.x + 140, 160, 'pi', complexes.atp.x + 20, complexes.atp.y - 80, 3, () => {
                        
                        // ADP와 Pi 소멸
                        adp1.active = false; adp1.stay = false;
                        pi1.active = false; pi1.stay = false;
                        adp2.active = false; adp2.stay = false;
                        pi2.active = false; pi2.stay = false;

                        // 결합해서 1 ATP 생성 후 정렬
                        spawnParticle(complexes.atp.x - 20, complexes.atp.y - 120, 'atp', complexes.atp.x + 80, 160, 2, (atp) => atp.stay = true);
                        
                        // 결합해서 0.5 ATP 생성 후 정렬
                        let atpHalf = spawnParticle(complexes.atp.x + 20, complexes.atp.y - 80, 'atp', complexes.atp.x + 160, 160, 2, (atp) => {
                            atp.stay = true;
                            if (isPlayingAll) {
                                setTimeout(() => {
                                    isPlayingAll = false;
                                    updateStatus("모든 과정이 완료되었습니다.<br>초기화 버튼을 눌러 다시 시작할 수 있습니다.");
                                }, 2000);
                            }
                        });
                        atpHalf.text = '½ATP'; atpHalf.radius = 30;
                    });
                    pi2.text = '½Pi'; pi2.radius = 22;
                }
            });
        }, index * 400); // 0.4초 간격으로 H+ 이동
    });
}

// --- 순환적 시뮬레이션 단계 함수들 ---

function cycStep1() {
    particles = [];
    activeElectrons = [];
    currentStep = 1;
    updateStatus("순환적 1단계: 빛 에너지가 광계 I에 도달하여 <b>2개의 전자(e-)</b>가 1차 수용체로 들뜬 후 페레독신(Fd)으로 이동합니다.<br>(물분해나 광계 II는 관여하지 않습니다.)");
    
    // 빛 생성 (속도 0.5배 감소)
    let photon = spawnParticle(complexes.ps1.x + 100, 50, 'photon', complexes.ps1.x, complexes.ps1.y - 40, 3, () => {
        photon.active = false;
        
        // P700에서 1차 수용체로 들뜬 후 Fd로 이동
        activeElectrons = [
            spawnParticle(complexes.ps1.x - 20, complexes.ps1.y + 20, 'electron', complexes.ps1.x - 20, complexes.ps1.y - 45, 3, (e) => {
                e.setTarget(complexes.fd.x - 15, complexes.fd.y, 3, () => e.stay = true);
            }),
            spawnParticle(complexes.ps1.x + 20, complexes.ps1.y + 20, 'electron', complexes.ps1.x + 20, complexes.ps1.y - 45, 3, (e) => {
                e.setTarget(complexes.fd.x + 15, complexes.fd.y, 3, () => {
                    e.stay = true;
                    if (isPlayingAll) setTimeout(cycStep2, 1500);
                });
            })
        ];
    });
}

function cycStep2() {
    if (!isPlayingAll && currentStep !== 1) {
        particles = [];
        activeElectrons = [];
    }
    currentStep = 2;
    updateStatus("순환적 2단계: 페레독신(Fd)의 전자가 NADP+ 환원효소로 가지 않고 <b>플라스토퀴논(PQ)</b>을 거쳐 <b>시토크롬 복합체</b>로 되돌아갑니다.<br>이후 시토크롬을 거치며 <b>4개의 H+</b>를 능동수송하고, 플라스토시아닌(PC)을 거쳐 광계 I으로 돌아옵니다.");
    
    if (activeElectrons.length < 2) {
        activeElectrons = [
            spawnParticle(complexes.fd.x - 15, complexes.fd.y, 'electron', complexes.fd.x - 15, complexes.fd.y, 3, (e) => e.stay = true),
            spawnParticle(complexes.fd.x + 15, complexes.fd.y, 'electron', complexes.fd.x + 15, complexes.fd.y, 3, (e) => e.stay = true)
        ];
    }

    // Fd -> PQ (크게 뒤로 이동)
    activeElectrons[0].setTarget(complexes.pq.x - 15, complexes.pq.y, 3);
    activeElectrons[1].setTarget(complexes.pq.x + 15, complexes.pq.y, 3, () => {
        
        // PQ -> Cyt
        activeElectrons[0].setTarget(complexes.cyt.x - 20, complexes.cyt.y, 3);
        activeElectrons[1].setTarget(complexes.cyt.x + 20, complexes.cyt.y, 3, () => {
            
            // H+ 펌핑
            const hOffsets = [-45, -15, 15, 45];
            hOffsets.forEach((offset, idx) => {
                setTimeout(() => {
                    spawnParticle(complexes.cyt.x + offset, 80 + Math.random()*20, 'h+', complexes.cyt.x + offset/2, complexes.cyt.y, 4, (h) => {
                        h.setTarget(h.x + offset, membraneY + 120 + Math.random()*80, 4, () => h.stay = true);
                    });
                }, idx * 150);
            });

            // H+ 펌핑 연출을 위해 약간 대기 후 PC로 이동
            setTimeout(() => {
                // Cyt -> PC
                activeElectrons[0].setTarget(complexes.pc.x - 15, complexes.pc.y, 3);
                activeElectrons[1].setTarget(complexes.pc.x + 15, complexes.pc.y, 3, () => {
                    
                    // PC -> PS1 (P700으로 이동하여 순환 완료)
                    activeElectrons[0].setTarget(complexes.ps1.x - 20, complexes.ps1.y + 20, 3, (e) => e.stay = true);
                    activeElectrons[1].setTarget(complexes.ps1.x + 20, complexes.ps1.y + 20, 3, (e) => {
                        e.stay = true;
                        if (isPlayingAll) setTimeout(cycStep3, 1500);
                    });
                });
            }, 600); // 펌핑 시간 대기
        });
    });
}

function cycStep3() {
    if (!isPlayingAll && currentStep !== 2) {
        particles = [];
        activeElectrons = [];
    }
    currentStep = 3;
    updateStatus("순환적 3단계: 루멘에 축적된 <b>4개의 H+</b>가 확산되며 <b>1개의 ATP</b>가 합성됩니다.<br>(NADPH와 산소는 만들어지지 않고 오직 ATP만 합성됩니다.)");
    
    let lumenProtons = particles.filter(p => p.type === 'h+' && p.y > membraneY + 20 && p.stay);

    const defaultPositions = [
        {x: complexes.atp.x - 40, y: membraneY + 220},
        {x: complexes.atp.x, y: membraneY + 260},
        {x: complexes.atp.x + 40, y: membraneY + 220},
        {x: complexes.atp.x + 20, y: membraneY + 150}
    ];

    // 순환적 흐름에서는 보통 4개만 통과
    while (lumenProtons.length < 4) {
        let pos = defaultPositions[lumenProtons.length % defaultPositions.length];
        let newH = spawnParticle(pos.x, pos.y, 'h+', pos.x, pos.y, 6);
        newH.stay = true;
        lumenProtons.push(newH);
    }
    
    // 4개만 선택해서 진행 (순환적의 특징)
    let selectedProtons = lumenProtons.slice(0, 4);

    selectedProtons.forEach((hAtp, index) => {
        setTimeout(() => {
            hAtp.setTarget(complexes.atp.x, complexes.atp.y, 6, () => {
                hAtp.setTarget(complexes.atp.x, complexes.atp.y - 150, 6, () => {
                    let finalX = complexes.atp.x - 320 + (index * 45);
                    let finalY = 260; // 생성물 정렬 Y (Stroma)
                    hAtp.setTarget(finalX, finalY, 3, () => hAtp.stay = true);
                });

                // 4개 통과 시작 시점에 ATP 생성
                if (index === selectedProtons.length - 1) {
                    let adp1 = spawnParticle(complexes.atp.x - 120, 100, 'adp', complexes.atp.x - 40, complexes.atp.y - 120, 3);
                    let pi1 = spawnParticle(complexes.atp.x + 120, 100, 'pi', complexes.atp.x + 40, complexes.atp.y - 120, 3, () => {
                        
                        adp1.active = false; adp1.stay = false;
                        pi1.active = false; pi1.stay = false;

                        spawnParticle(complexes.atp.x - 20, complexes.atp.y - 120, 'atp', complexes.atp.x + 40, 160, 2, (atp) => {
                            atp.stay = true;
                            if (isPlayingAll) {
                                setTimeout(() => {
                                    isPlayingAll = false;
                                    updateStatus("순환적 광인산화 모든 과정이 완료되었습니다.<br>초기화 버튼을 눌러 다시 시작할 수 있습니다.");
                                }, 2000);
                            }
                        });
                    });
                }
            });
        }, index * 400);
    });
}

// 이벤트 리스너 연결
document.getElementById('btn-play-all').addEventListener('click', () => {
    particles = [];
    activeElectrons = [];
    isPlayingAll = true;
    isPaused = false;
    if (currentMode === 'noncyclic') {
        step1();
    } else {
        cycStep1();
    }
});

document.getElementById('btn-pause').addEventListener('click', () => {
    isPaused = !isPaused;
    document.getElementById('btn-pause').innerText = isPaused ? "재개" : "일시정지";
});

document.getElementById('btn-reset').addEventListener('click', resetSim);

document.getElementById('btn-step1').addEventListener('click', () => { isPlayingAll = false; step1(); });
document.getElementById('btn-step2').addEventListener('click', () => { isPlayingAll = false; step2(); });
document.getElementById('btn-step3').addEventListener('click', () => { isPlayingAll = false; step3(); });
document.getElementById('btn-step4').addEventListener('click', () => { isPlayingAll = false; step4(); });

document.getElementById('btn-cyc-step1').addEventListener('click', () => { isPlayingAll = false; cycStep1(); });
document.getElementById('btn-cyc-step2').addEventListener('click', () => { isPlayingAll = false; cycStep2(); });
document.getElementById('btn-cyc-step3').addEventListener('click', () => { isPlayingAll = false; cycStep3(); });

// 초기화 시작
resize();
animate();

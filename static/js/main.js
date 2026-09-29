let chartInstances = {};
let globalCams = [], globalProjs = [], globalDocs = [], globalCustomMeta = { groups: [], schemas: [] };

const DEFAULT_PHASES = {
    predictive: ["1. تجميع المتطلبات والنطاق", "2. التصميم والتخطيط الهندسي", "3. التنفيذ والتطوير الشامل", "4. الاختيار وضمان الجودة QA", "5. التسليم والإغلاق النهائي"],
    agile: ["1. رؤية المنتج و Product Backlog", "2. تخطيط الدورات Sprint Planning", "3. التطوير والتكرارات المباشرة", "4. مراجعة المخرجات Sprint Review", "5. تقييم الأداء Retrospective"],
    incremental: ["1. تحليل وتقسيم الوحدات Modules", "2. بناء واختبار الجزء الأساسي", "3. بناء الأجزاء الإضافية متتابعة", "4. دمج المكونات والتكامل System Integration", "5. التشغيل والاعتماد التدريجي"],
    hybrid: ["1. التخطيط التنبئي للبنية والتجهيزات", "2. التطوير المرن الرشيق للأنظمة البرمجية", "3. دمج البرمجيات مع العتاد Hardware/Software", "4. الاختبارات التشغيلية الشاملة", "5. الإطلاق النهائي والصيانة"]
};

window.onload = function() {
    addBuilderFieldRow();
    renderPhaseInputs('ready');
    renderPhaseInputs('dev');
    loadAllData();
    restoreLastTab();
};

function toggleGroup(btn) { btn.parentElement.classList.toggle('open'); }

function formatUrl(url) {
    if (!url) return '#';
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        return 'http://' + cleanUrl;
    }
    return cleanUrl;
}

function navigate(pageId, btn = null) {
    document.querySelectorAll('.section-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.submenu-btn').forEach(b => b.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (!targetPage) return;

    targetPage.classList.add('active');
    if (!btn) btn = document.querySelector(`.submenu-btn[data-target="${pageId}"]`);
    if (btn) {
        btn.classList.add('active');
        document.getElementById('page-title').innerText = btn.innerText.trim();
    }
    localStorage.setItem('active_tab', pageId);
    renderAll();
}

function restoreLastTab() {
    const savedTab = localStorage.getItem('active_tab') || 'cams-active';
    navigate(savedTab);
}

async function loadAllData() {
    try {
        const [camsRes, projsRes, docsRes, metaRes] = await Promise.all([
            fetch('/api/cameras'), fetch('/api/projects'), fetch('/api/docs'), fetch('/api/custom/meta')
        ]);

        globalCams = await camsRes.json();
        globalProjs = await projsRes.json();
        globalDocs = await docsRes.json();
        globalCustomMeta = await metaRes.json();

        renderAll();
    } catch(e) {
        console.error("خطأ عند تحميل البيانات:", e);
    }
}

function renderPhaseInputs(type, existingPhases = null) {
    const lcKey = document.getElementById(type === 'ready' ? 'proj-lc' : 'dev-lc').value;
    const container = document.getElementById(type === 'ready' ? 'ready-phases-inputs' : 'dev-phases-inputs');
    const phases = DEFAULT_PHASES[lcKey];

    container.innerHTML = phases.map((phaseName, idx) => {
        const progValue = existingPhases && existingPhases[idx] ? existingPhases[idx].progress : (type==='ready' ? 100 : (idx*20));
        const delivValue = existingPhases && existingPhases[idx] ? existingPhases[idx].deliverable : '';
        return `
        <div class="phase-row">
            <div style="font-size:0.85rem; font-weight:bold;">${phaseName}</div>
            <input type="number" id="${type}-prog-${idx}" placeholder="نسبة الإنجاز %" min="0" max="100" value="${progValue}">
            <input type="text" id="${type}-deliverable-${idx}" placeholder="المخرج الرئيسي" value="${delivValue}">
        </div>`;
    }).join('');
}

// --- الكاميرات ---
async function addOrUpdateCam(e, isActive) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData();

    const id = document.getElementById(isActive ? 'cam-active-id' : 'cam-inactive-id').value;
    const name = document.getElementById(isActive ? 'cam-name' : 'cam-off-name').value;
    const url = isActive ? document.getElementById('cam-url').value : '';
    const reason = !isActive ? document.getElementById('cam-off-reason').value : '';
    const file = document.getElementById(isActive ? 'cam-img' : 'cam-off-img').files[0];

    if (id) formData.append('id', id);
    formData.append('name', name);
    formData.append('url', url);
    formData.append('reason', reason);
    formData.append('is_active', isActive ? 1 : 0);
    if (file) formData.append('image', file);

    const res = await fetch('/api/cameras', { method: 'POST', body: formData });
    if (res.ok) {
        form.reset();
        document.getElementById(isActive ? 'cam-active-id' : 'cam-inactive-id').value = '';
        document.getElementById(isActive ? 'btn-cam-active' : 'btn-cam-inactive').innerText = isActive ? 'إضافة كاميرا' : 'تسجيل معطلة';
        loadAllData();
    }
}

function editCam(id) {
    const cam = globalCams.find(c => c.id === id);
    if (!cam) return;

    if (cam.is_active) {
        document.getElementById('cam-active-id').value = cam.id;
        document.getElementById('cam-name').value = cam.name;
        document.getElementById('cam-url').value = cam.url || '';
        document.getElementById('btn-cam-active').innerText = 'تحديث بيانات الكاميرا';
        navigate('cams-active');
    } else {
        document.getElementById('cam-inactive-id').value = cam.id;
        document.getElementById('cam-off-name').value = cam.name;
        document.getElementById('cam-off-reason').value = cam.reason || '';
        document.getElementById('btn-cam-inactive').innerText = 'تحديث بيانات المعطلة';
        navigate('cams-inactive');
    }
}

async function deleteCam(id) {
    if (confirm('هل أنت تأكد من الحذف؟')) {
        await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
        loadAllData();
    }
}

// --- المشاريع ---
async function addOrUpdateProject(type) {
    const isReady = type === 'ready';
    const projId = document.getElementById(isReady ? 'proj-ready-id' : 'proj-dev-id').value;
    const name = document.getElementById(isReady ? 'proj-name' : 'dev-name').value.trim();
    const extraLinkDesc = document.getElementById(isReady ? 'proj-link' : 'dev-desc').value.trim();
    const lcKey = document.getElementById(isReady ? 'proj-lc' : 'dev-lc').value;

    if (!name) return alert('يرجى كتابة الاسم');

    const phasesList = DEFAULT_PHASES[lcKey].map((pName, idx) => {
        const prog = parseInt(document.getElementById(`${type}-prog-${idx}`).value) || 0;
        const deliv = document.getElementById(`${type}-deliverable-${idx}`).value || 'مخرجات متناسقة';
        return { name: pName, progress: prog, deliverable: deliv };
    });

    const payload = {
        id: projId || null,
        name: name,
        extra_link_desc: extraLinkDesc,
        lc_key: lcKey,
        phases: phasesList,
        is_ready: isReady ? 1 : 0
    };

    const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        document.getElementById(isReady ? 'proj-ready-id' : 'proj-dev-id').value = '';
        document.getElementById(isReady ? 'proj-name' : 'dev-name').value = '';
        document.getElementById(isReady ? 'proj-link' : 'dev-desc').value = '';
        renderPhaseInputs(type);
        loadAllData();
    }
}

function editProject(id) {
    const p = globalProjs.find(x => x.id === id);
    if (!p) return;

    const phases = JSON.parse(p.phases || "[]");
    const isReady = p.is_ready === 1;

    if (isReady) {
        document.getElementById('proj-ready-id').value = p.id;
        document.getElementById('proj-name').value = p.name;
        document.getElementById('proj-link').value = p.extra_link_desc || '';
        document.getElementById('proj-lc').value = p.lc_key;
        renderPhaseInputs('ready', phases);
        navigate('proj-ready');
    } else {
        document.getElementById('proj-dev-id').value = p.id;
        document.getElementById('dev-name').value = p.name;
        document.getElementById('dev-desc').value = p.extra_link_desc || '';
        document.getElementById('dev-lc').value = p.lc_key;
        renderPhaseInputs('dev', phases);
        navigate('proj-dev');
    }
}

async function deleteProject(id) {
    if (confirm('هل أنت تأكد من الحذف؟')) {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        loadAllData();
    }
}

// --- التوثيق ---
async function addOrUpdateDoc(e) {
    e.preventDefault();
    const formData = new FormData();
    const docId = document.getElementById('doc-id').value;
    const name = document.getElementById('doc-name').value;
    const desc = document.getElementById('doc-desc').value;
    const file = document.getElementById('doc-file').files[0];

    if (docId) formData.append('id', docId);
    formData.append('name', name);
    formData.append('desc', desc);
    if (file) formData.append('file', file);

    const res = await fetch('/api/docs', { method: 'POST', body: formData });
    if (res.ok) {
        document.getElementById('form-doc').reset();
        document.getElementById('doc-id').value = '';
        document.getElementById('btn-doc').innerText = 'رفع وحفظ التوثيق';
        loadAllData();
    }
}

function editDoc(id) {
    const d = globalDocs.find(x => x.id === id);
    if (!d) return;

    document.getElementById('doc-id').value = d.id;
    document.getElementById('doc-name').value = d.name;
    document.getElementById('doc-desc').value = d.desc || '';
    document.getElementById('btn-doc').innerText = 'تحديث التوثيق';
    navigate('docs-list');
}

async function deleteDoc(id) {
    if (confirm('هل أنت تأكد من الحذف؟')) {
        await fetch(`/api/docs/${id}`, { method: 'DELETE' });
        loadAllData();
    }
}

// --- الأقسام الديناميكية ---
function addBuilderFieldRow() {
    const container = document.getElementById('builder-fields-container');
    const fieldId = 'f_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    
    const div = document.createElement('div');
    div.className = 'builder-field-row';
    div.id = fieldId;
    div.innerHTML = `
        <input type="text" placeholder="عنوان العنصر" class="builder-field-name">
        <select class="builder-field-type">
            <option value="text">مربع نص (Text)</option>
            <option value="select">قائمة منسدلة (Select)</option>
            <option value="file">مرفق ملف / صورة (File)</option>
        </select>
        <button type="button" class="btn-submit" style="background:var(--danger);" onclick="document.getElementById('${fieldId}').remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

function toggleGroupCreationInput() {
    const selectVal = document.getElementById('builder-group-select').value;
    document.getElementById('new-group-input-box').style.display = (selectVal === 'new') ? 'block' : 'none';
}

async function saveCustomPageSchema() {
    const groupSelectVal = document.getElementById('builder-group-select').value;
    let groupName = (groupSelectVal === 'new') ? document.getElementById('builder-group-name').value.trim() : groupSelectVal;
    if (!groupName) return alert('يرجى تحديد أو كتابة اسم القائمة الرئيسية');

    const title = document.getElementById('builder-page-name').value.trim();
    const icon = document.getElementById('builder-page-icon').value.trim() || 'fa-folder';
    if (!title) return alert('يرجى كتابة اسم التبويب');

    const rows = document.querySelectorAll('.builder-field-row');
    const fields = [];
    rows.forEach(r => {
        const fName = r.querySelector('.builder-field-name').value.trim();
        const fType = r.querySelector('.builder-field-type').value;
        if (fName) fields.push({ id: 'f_' + Math.random().toString(36).substr(2, 6), label: fName, type: fType });
    });

    if (!fields.length) return alert('أضف عنصراً واحداً على الأقل');

    const payload = {
        id: 'custom_' + Date.now(),
        group_name: groupName,
        title: title,
        icon: icon,
        fields: fields
    };

    const res = await fetch('/api/custom/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        document.getElementById('builder-page-name').value = '';
        document.getElementById('builder-group-name').value = '';
        document.getElementById('builder-fields-container').innerHTML = '';
        addBuilderFieldRow();
        loadAllData();
        navigate(payload.id);
    }
}

async function addOrUpdateCustomEntry(schemaId) {
    const schema = globalCustomMeta.schemas.find(s => s.id === schemaId);
    if (!schema) return;

    const fields = JSON.parse(schema.fields || "[]");
    const formData = new FormData();
    const entryData = {};

    fields.forEach(f => {
        const input = document.getElementById(`input_${schemaId}_${f.id}`);
        if (f.type === 'file') {
            if (input && input.files[0]) {
                formData.append(f.id, input.files[0]);
            }
        } else {
            entryData[f.id] = input ? input.value : '';
        }
    });

    formData.append('schema_id', schemaId);
    formData.append('data_json', JSON.stringify(entryData));

    const res = await fetch('/api/custom/entry', { method: 'POST', body: formData });
    if (res.ok) {
        loadAllData();
    }
}

async function deleteCustomEntry(entryId) {
    if (confirm('هل أنت تأكد من الحذف؟')) {
        await fetch(`/api/custom/entry/${entryId}`, { method: 'DELETE' });
        loadAllData();
    }
}

async function deleteCustomSchema(schemaId) {
    if (confirm('هل أنت تأكد من حذف هذا القسم بالكامل؟')) {
        await fetch(`/api/custom/schema/${schemaId}`, { method: 'DELETE' });
        loadAllData();
        navigate('cams-active');
    }
}

// --- العرض المباشر والديناميكي ---
function renderAll() {
    const searchVal = document.getElementById('global-search-input').value.trim().toLowerCase();

    // الكاميرات
    const activeCams = globalCams.filter(c => c.is_active === 1 && c.name.toLowerCase().includes(searchVal));
    const inactiveCams = globalCams.filter(c => c.is_active === 0 && c.name.toLowerCase().includes(searchVal));

    document.getElementById('cams-active-grid').innerHTML = activeCams.map(c => `
        <div class="card">
            <div class="card-header">
                <span>${c.name}</span>
                <div class="card-actions">
                    <span class="badge badge-success">شغالة</span>
                    <i class="fa-solid fa-pen-to-square action-icon" style="color:var(--warning);" onclick="editCam(${c.id})"></i>
                    <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteCam(${c.id})"></i>
                </div>
            </div>
            <div class="card-body">
                ${c.image ? `<img src="/static/uploads/${c.image}" class="cam-img-preview">` : `<iframe src="${formatUrl(c.url)}"></iframe>`}
                <button class="btn-submit" style="width:100%; margin-top:8px;" onclick="openModal('${c.name}', '${c.image ? '/static/uploads/'+c.image : formatUrl(c.url)}', ${!!c.image})"><i class="fa-solid fa-expand"></i> تكبير</button>
            </div>
        </div>
    `).join('');

    document.getElementById('cams-inactive-grid').innerHTML = inactiveCams.map(c => `
        <div class="card">
            <div class="card-header">
                <span>${c.name}</span>
                <div class="card-actions">
                    <i class="fa-solid fa-pen-to-square action-icon" style="color:var(--warning);" onclick="editCam(${c.id})"></i>
                    <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteCam(${c.id})"></i>
                </div>
            </div>
            <div class="card-body">
                ${c.image ? `<img src="/static/uploads/${c.image}" class="cam-img-preview" style="margin-bottom:10px;">` : ''}
                <p style="color:var(--text-muted);">${c.reason || 'لا تفاصيل'}</p>
            </div>
        </div>
    `).join('');

    // المشاريع
    const readyProjs = globalProjs.filter(p => p.is_ready === 1 && p.name.toLowerCase().includes(searchVal));
    const devProjs = globalProjs.filter(p => p.is_ready === 0 && p.name.toLowerCase().includes(searchVal));

    document.getElementById('proj-ready-grid').innerHTML = readyProjs.map(p => {
        const phases = JSON.parse(p.phases || "[]");
        return `
        <div class="card">
            <div class="card-header">
                <span>${p.name}</span>
                <div class="card-actions">
                    <i class="fa-solid fa-pen-to-square action-icon" style="color:var(--warning);" onclick="editProject(${p.id})"></i>
                    <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteProject(${p.id})"></i>
                </div>
            </div>
            <div class="card-body">
                <iframe src="${formatUrl(p.extra_link_desc)}"></iframe>
                <div class="phase-list">
                    ${phases.map(ph => `<div class="phase-item ${ph.progress===100?'done':'in_progress'}"><span>${ph.name}</span><span><b>${ph.progress}%</b> | ${ph.deliverable}</span></div>`).join('')}
                </div>
                <div class="chart-box"><canvas id="chart-ready-${p.id}"></canvas></div>
            </div>
        </div>`;
    }).join('');

    document.getElementById('proj-dev-grid').innerHTML = devProjs.map(p => {
        const phases = JSON.parse(p.phases || "[]");
        return `
        <div class="card">
            <div class="card-header">
                <span>${p.name}</span>
                <div class="card-actions">
                    <span class="badge badge-warning">تطوير</span>
                    <i class="fa-solid fa-pen-to-square action-icon" style="color:var(--warning);" onclick="editProject(${p.id})"></i>
                    <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteProject(${p.id})"></i>
                </div>
            </div>
            <div class="card-body">
                <p style="color:var(--text-muted); font-size:0.85rem;">${p.extra_link_desc}</p>
                <div class="phase-list">
                    ${phases.map(ph => `<div class="phase-item ${ph.progress===100?'done':'in_progress'}"><span>${ph.name}</span><span><b>${ph.progress}%</b> | ${ph.deliverable}</span></div>`).join('')}
                </div>
                <div class="chart-box"><canvas id="chart-dev-${p.id}"></canvas></div>
            </div>
        </div>`;
    }).join('');

    // التوثيق
    const docs = globalDocs.filter(d => d.name.toLowerCase().includes(searchVal));
    document.getElementById('docs-grid').innerHTML = docs.map(d => `
        <div class="card" style="grid-column: span 2;">
            <div class="card-header">
                <span><i class="fa-solid fa-file-pdf" style="color:var(--danger);"></i> ${d.name}</span>
                <div class="card-actions">
                    <i class="fa-solid fa-pen-to-square action-icon" style="color:var(--warning);" onclick="editDoc(${d.id})"></i>
                    <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteDoc(${d.id})"></i>
                </div>
            </div>
            <div class="card-body">
                <p style="color:var(--text-muted);">${d.desc || ''}</p>
                ${d.file_path ? `<iframe style="height:320px; width:100%; border:none; margin-top:10px;" src="/static/uploads/${d.file_path}"></iframe>` : ''}
            </div>
        </div>
    `).join('');

    renderDynamicPages();

    setTimeout(() => {
        readyProjs.forEach(p => createPhaseChart(`chart-ready-${p.id}`, JSON.parse(p.phases || "[]")));
        devProjs.forEach(p => createPhaseChart(`chart-dev-${p.id}`, JSON.parse(p.phases || "[]")));
    }, 100);
}

async function renderDynamicPages() {
    const { groups, schemas } = globalCustomMeta;
    const container = document.getElementById('dynamic-menu-groups-container');
    const pageContainer = document.getElementById('dynamic-pages-container');

    container.innerHTML = groups.map(g => {
        const groupSchemas = schemas.filter(s => s.group_name === g.name);
        if (!groupSchemas.length) return '';

        return `
        <div class="menu-group open">
            <button class="menu-btn" onclick="toggleGroup(this)">
                <span><i class="fa-solid fa-folder-tree"></i> ${g.name}</span>
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="submenu">
                ${groupSchemas.map(s => `
                    <button class="submenu-btn" data-target="${s.id}" onclick="navigate('${s.id}', this)">
                        <span><i class="fa-solid ${s.icon}"></i> ${s.title}</span>
                        <i class="fa-solid fa-trash action-icon" style="color:var(--danger); font-size:0.75rem;" title="حذف التبويب" onclick="event.stopPropagation(); deleteCustomSchema('${s.id}')"></i>
                    </button>
                `).join('')}
            </div>
        </div>`;
    }).join('');

    let pagesHtml = '';
    for (let s of schemas) {
        const fields = JSON.parse(s.fields || "[]");
        const res = await fetch(`/api/custom/data/${s.id}`);
        const entries = await res.json();

        pagesHtml += `
        <div id="${s.id}" class="section-page">
            <div class="form-card">
                <h4 style="margin-bottom:12px; color:var(--accent);"><i class="fa-solid ${s.icon}"></i> إضافة عنصر إلى [ ${s.title} ]</h4>
                <div class="form-grid">
                    ${fields.map(f => {
                        if (f.type === 'file') {
                            return `<div class="input-box"><label>${f.label}</label><input type="file" id="input_${s.id}_${f.id}"></div>`;
                        }
                        return `<div class="input-box"><label>${f.label}</label><input type="text" id="input_${s.id}_${f.id}"></div>`;
                    }).join('')}
                </div>
                <button class="btn-submit" onclick="addOrUpdateCustomEntry('${s.id}')"><i class="fa-solid fa-plus"></i> إضافة</button>
            </div>
            <div class="grid-layout">
                ${entries.map(item => {
                    const data = JSON.parse(item.data_json || "{}");
                    return `
                    <div class="card">
                        <div class="card-header">
                            <span>عنصر #${item.id}</span>
                            <i class="fa-solid fa-trash action-icon" style="color:var(--danger);" onclick="deleteCustomEntry(${item.id})"></i>
                        </div>
                        <div class="card-body">
                            ${fields.map(f => {
                                const val = data[f.id];
                                if (!val) return '';
                                if (f.type === 'file' && val.filename) {
                                    return `<iframe src="/static/uploads/${val.filename}" style="height:150px; width:100%;"></iframe>`;
                                }
                                return `<p><b>${f.label}:</b> ${val}</p>`;
                            }).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }
    pageContainer.innerHTML = pagesHtml;

    const select = document.getElementById('builder-group-select');
    if (select) {
        select.innerHTML = '<option value="new">+ إنشاء قائمة منسدلة جديدة</option>' + 
            groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    }
}

function createPhaseChart(canvasId, phases) {
    if (!document.getElementById(canvasId)) return;
    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); }
    const ctx = document.getElementById(canvasId).getContext('2d');

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: phases.map(p => p.name.split(' ')[1] || p.name),
            datasets: [{
                label: 'الإنجاز (%)',
                data: phases.map(p => p.progress),
                backgroundColor: phases.map(p => p.progress === 100 ? '#10b981' : (p.progress > 0 ? '#f59e0b' : '#374151')),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { max: 100, min: 0, ticks: { color: '#9ca3af' } }, x: { ticks: { color: '#9ca3af', font: { size: 9 } } } },
            plugins: { legend: { display: false } }
        }
    });
}

function openModal(title, src, isImg = false) {
    document.getElementById('modal-title').innerText = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = isImg ? `<img src="${src}" style="width:100%; height:100%; object-fit:contain;">` : `<iframe src="${src}" style="width:100%; height:100%;"></iframe>`;
    document.getElementById('modal-viewer').style.display = 'flex';
}

function closeModal() { document.getElementById('modal-viewer').style.display = 'none'; }
function toggleAiChat() { const card = document.getElementById('ai-chat-card'); card.style.display = (card.style.display === 'flex') ? 'none' : 'flex'; }

async function sendAiMessage() {
    const input = document.getElementById('ai-user-input');
    const messagesContainer = document.getElementById('ai-messages');
    const userText = input.value.trim();
    if (!userText) return;

    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'ai-msg user';
    userMsgDiv.innerText = userText;
    messagesContainer.appendChild(userMsgDiv);
    input.value = '';

    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'ai-msg bot';
    botMsgDiv.innerText = 'جاري التفكير بالاستجابة...';
    messagesContainer.appendChild(botMsgDiv);

    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: userText })
        });
        const data = await response.json();
        botMsgDiv.innerText = data.reply;
    } catch (e) {
        botMsgDiv.innerText = "تعذر الاتصال بالمساعد الذكي.";
    }
}
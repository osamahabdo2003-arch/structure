import os
import sqlite3
import json
import requests
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from apscheduler.schedulers.background import BackgroundScheduler

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)

UPLOAD_FOLDER = os.path.join('static', 'uploads')
DATABASE = 'system_dashboard.db'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# إعدادات البريد الإلكتروني (SMTP)
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "osamasadk501@gmail.com"       
SENDER_PASSWORD = "akbw rmyl nwlj pntx"     

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cameras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT,
            reason TEXT,
            image TEXT,
            is_active INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            extra_link_desc TEXT,
            lc_key TEXT,
            phases TEXT,
            is_ready INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS docs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            desc TEXT,
            file_path TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_schemas (
            id TEXT PRIMARY KEY,
            group_name TEXT,
            title TEXT,
            icon TEXT,
            fields TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_id TEXT,
            data_json TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reminders_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER,
            field_id TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(entry_id, field_id)
        )
    ''')

    cursor.execute("INSERT OR IGNORE INTO custom_groups (name) VALUES ('الأقسام المخصصة')")
    conn.commit()
    conn.close()

init_db()

def send_email_notification(to_email, subject, body_text):
    """دالة مساعدة لإرسال البريد الإلكتروني عبر SMTP"""
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"✅ تم إرسال البريد بنجاح إلى: {to_email}")
        return True
    except Exception as e:
        print(f"❌ فشل إرسال البريد إلى {to_email}: {e}")
        return False

def check_and_process_reminders():
    """دالة الجدولة: تفحص السجلات وتقارن التاريخ والوقت الحالي بـ send_date"""
    conn = get_db()
    cursor = conn.cursor()
    
    rows = cursor.execute('SELECT id, schema_id, data_json FROM custom_store').fetchall()
    now = datetime.now()

    for row in rows:
        entry_id = row['id']
        try:
            data = json.loads(row['data_json'] or '{}')
        except:
            continue

        for field_id, val in data.items():
            if isinstance(val, dict) and 'send_date' in val and 'email' in val:
                try:
                    if not val['send_date']:
                        continue
                        
                    # تحويل صيغة datetime-local القادمة من HTML
                    send_datetime = datetime.strptime(val['send_date'].replace('T', ' '), '%Y-%m-%d %H:%M')

                    # التحقق مما إذا حان وقت الإرسال أو تم تجاوزه
                    if now >= send_datetime:
                        already_sent = cursor.execute(
                            'SELECT 1 FROM reminders_log WHERE entry_id=? AND field_id=?',
                            (entry_id, field_id)
                        ).fetchone()

                        if not already_sent:
                            task_name = val.get('task_name', 'مهمة بدون عنوان')
                            to_email = val.get('email')
                            email_body = val.get('body', '')

                            subject = f" تذكير بمهمة: {task_name}"
                            full_text = (
                                f"مرحباً،\n\n"
                                f"تذكير للمهمةالتالية:\n"
                                f"📌 اسم المهمة: {task_name}\n"
                                f"📅 التاريخ والوقت المستهدف: {val.get('send_date').replace('T', ' ')}\n\n"
                                f"📝 تفاصيل ومحتوى الرسالة:\n{email_body}\n\n"
                                f"تم الإرسال تلقائياً بواسطة نظام إدارة المشاريع."
                            )

                            if to_email:
                                sent_ok = send_email_notification(to_email, subject, full_text)
                                if sent_ok:
                                    cursor.execute(
                                        'INSERT OR IGNORE INTO reminders_log (entry_id, field_id) VALUES (?, ?)',
                                        (entry_id, field_id)
                                    )
                                    conn.commit()
                except Exception as ex:
                    print(f"خطأ أثناء معالجة التذكير للعنصر {entry_id}: {ex}")

    conn.close()

# مجدول العمليات لتفقد التذكيرات دورياً كل دقيقة
scheduler = BackgroundScheduler()
scheduler.add_job(func=check_and_process_reminders, trigger="interval", minutes=1)
scheduler.start()

def save_uploaded_file(file_obj):
    if file_obj and file_obj.filename != '':
        filename = secure_filename(file_obj.filename)
        name, ext = os.path.splitext(filename)
        filename = f"{name}_{os.urandom(4).hex()}{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file_obj.save(filepath)
        return filename
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/cameras', methods=['GET'])
def get_cameras():
    db = get_db()
    cams = db.execute('SELECT * FROM cameras ORDER BY id DESC').fetchall()
    db.close()
    return jsonify([dict(row) for row in cams])

@app.route('/api/cameras', methods=['POST'])
def save_camera():
    name = request.form.get('name')
    url = request.form.get('url', '')
    reason = request.form.get('reason', '')
    is_active = int(request.form.get('is_active', 1))
    cam_id = request.form.get('id')

    uploaded_img = save_uploaded_file(request.files.get('image'))

    db = get_db()
    if cam_id:
        if uploaded_img:
            db.execute('UPDATE cameras SET name=?, url=?, reason=?, image=?, is_active=? WHERE id=?',
                       (name, url, reason, uploaded_img, is_active, cam_id))
        else:
            db.execute('UPDATE cameras SET name=?, url=?, reason=?, is_active=? WHERE id=?',
                       (name, url, reason, is_active, cam_id))
    else:
        db.execute('INSERT INTO cameras (name, url, reason, image, is_active) VALUES (?, ?, ?, ?, ?)',
                   (name, url, reason, uploaded_img, is_active))
    
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/cameras/<int:cam_id>', methods=['DELETE'])
def delete_camera(cam_id):
    db = get_db()
    db.execute('DELETE FROM cameras WHERE id=?', (cam_id,))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/projects', methods=['GET'])
def get_projects():
    db = get_db()
    projs = db.execute('SELECT * FROM projects ORDER BY id DESC').fetchall()
    db.close()
    return jsonify([dict(row) for row in projs])

@app.route('/api/projects', methods=['POST'])
def save_project():
    data = request.json
    db = get_db()
    proj_id = data.get('id')
    phases_json = json.dumps(data.get('phases', []))

    if proj_id:
        db.execute('UPDATE projects SET name=?, extra_link_desc=?, lc_key=?, phases=?, is_ready=? WHERE id=?',
                   (data['name'], data['extra_link_desc'], data['lc_key'], phases_json, data['is_ready'], proj_id))
    else:
        db.execute('INSERT INTO projects (name, extra_link_desc, lc_key, phases, is_ready) VALUES (?, ?, ?, ?, ?)',
                   (data['name'], data['extra_link_desc'], data['lc_key'], phases_json, data['is_ready']))
    
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/projects/<int:proj_id>', methods=['DELETE'])
def delete_project(proj_id):
    db = get_db()
    db.execute('DELETE FROM projects WHERE id=?', (proj_id,))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/docs', methods=['GET'])
def get_docs():
    db = get_db()
    docs = db.execute('SELECT * FROM docs ORDER BY id DESC').fetchall()
    db.close()
    return jsonify([dict(row) for row in docs])

@app.route('/api/docs', methods=['POST'])
def save_doc():
    name = request.form.get('name')
    desc = request.form.get('desc', '')
    doc_id = request.form.get('id')

    uploaded_file = save_uploaded_file(request.files.get('file'))

    db = get_db()
    if doc_id:
        if uploaded_file:
            db.execute('UPDATE docs SET name=?, desc=?, file_path=? WHERE id=?', (name, desc, uploaded_file, doc_id))
        else:
            db.execute('UPDATE docs SET name=?, desc=? WHERE id=?', (name, desc, doc_id))
    else:
        db.execute('INSERT INTO docs (name, desc, file_path) VALUES (?, ?, ?)', (name, desc, uploaded_file))
    
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/docs/<int:doc_id>', methods=['DELETE'])
def delete_doc(doc_id):
    db = get_db()
    db.execute('DELETE FROM docs WHERE id=?', (doc_id,))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/custom/meta', methods=['GET'])
def get_custom_meta():
    db = get_db()
    groups = [dict(r) for r in db.execute('SELECT * FROM custom_groups').fetchall()]
    schemas = [dict(r) for r in db.execute('SELECT * FROM custom_schemas').fetchall()]
    db.close()
    return jsonify({'groups': groups, 'schemas': schemas})

@app.route('/api/custom/schema', methods=['POST'])
def save_schema():
    data = request.json
    db = get_db()
    db.execute('INSERT OR IGNORE INTO custom_groups (name) VALUES (?)', (data['group_name'],))
    
    fields_data = data['fields']
    if not isinstance(fields_data, str):
        fields_data = json.dumps(fields_data)

    db.execute('INSERT OR REPLACE INTO custom_schemas (id, group_name, title, icon, fields) VALUES (?, ?, ?, ?, ?)',
               (data['id'], data['group_name'], data['title'], data['icon'], fields_data))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/custom/schema/<schema_id>', methods=['DELETE'])
def delete_schema(schema_id):
    db = get_db()
    db.execute('DELETE FROM custom_schemas WHERE id=?', (schema_id,))
    db.execute('DELETE FROM custom_store WHERE schema_id=?', (schema_id,))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/custom/data/<schema_id>', methods=['GET'])
def get_custom_data(schema_id):
    db = get_db()
    rows = db.execute('SELECT * FROM custom_store WHERE schema_id=? ORDER BY id DESC', (schema_id,)).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/custom/entry', methods=['POST'])
def save_custom_entry():
    schema_id = request.form.get('schema_id')
    entry_id = request.form.get('entry_id')
    raw_data = json.loads(request.form.get('data_json', '{}'))

    db = get_db()

    old_data = {}
    if entry_id:
        row = db.execute('SELECT data_json FROM custom_store WHERE id=?', (entry_id,)).fetchone()
        if row and row['data_json']:
            old_data = json.loads(row['data_json'])

    for key, val in request.files.items():
        saved_file = save_uploaded_file(val)
        if saved_file:
            raw_data[key] = {'filename': saved_file}

    for key, val in old_data.items():
        if key not in raw_data and isinstance(val, dict) and 'filename' in val:
            raw_data[key] = val

    data_json_str = json.dumps(raw_data)

    if entry_id:
        db.execute('UPDATE custom_store SET data_json=? WHERE id=?', (data_json_str, entry_id))
        # 👈 الإشعارات المجدولة: يتم إزالة سجل الإرسال القديم ليُسمح للنظام بإعادة الإرسال في الموعد الجديد
        db.execute('DELETE FROM reminders_log WHERE entry_id=?', (entry_id,))
    else:
        db.execute('INSERT INTO custom_store (schema_id, data_json) VALUES (?, ?)', (schema_id, data_json_str))
    
    db.commit()
    db.close()

    check_and_process_reminders()

    return jsonify({'status': 'success'})

@app.route('/api/custom/entry/<int:entry_id>', methods=['DELETE'])
def delete_custom_entry(entry_id):
    db = get_db()
    db.execute('DELETE FROM custom_store WHERE id=?', (entry_id,))
    db.execute('DELETE FROM reminders_log WHERE entry_id=?', (entry_id,))
    db.commit()
    db.close()
    return jsonify({'status': 'success'})

@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_text = request.json.get('prompt', '')
    db = get_db()
    cams = [dict(r) for r in db.execute('SELECT name, is_active FROM cameras').fetchall()]
    projs = [dict(r) for r in db.execute('SELECT name, is_ready FROM projects').fetchall()]
    db.close()

    system_prompt = f"أنت مساعد إدارة اللوحة المعتمد على Flask + SQLite. البيانات الحالية: الكاميرات ({json.dumps(cams, ensure_ascii=False)})، المشاريع ({json.dumps(projs, ensure_ascii=False)}). أجِب عن: {user_text}"

    try:
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        response = requests.post(url, json={"contents": [{"parts": [{"text": system_prompt}]}]}, timeout=10)
        res_data = response.json()
        reply = res_data['candidates'][0]['content']['parts'][0]['text']
        return jsonify({'reply': reply})
    except Exception as e:
        return jsonify({'reply': 'عذراً، لم نتمكن من الاتصال بمركز معالجة الذكاء الاصطناعي.'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
"""Reference SQLite migrator and test harness. Android uses migrate.ts adapter."""
import json
import sqlite3
from pathlib import Path
SCHEMA = Path(__file__).resolve().parents[1] / 'sqlite_mobile_schema.sql'
V2 = {'local_contexts','local_patients','local_exams','local_exam_versions','sync_queue','sync_metadata','local_file_cleanup','legacy_queue_quarantine'}
LEGACY = {'local_patients','local_exams','local_exam_versions','sync_queue','sync_metadata'}

def execute_script_transactionally(db, script):
    statement = ''
    for char in script:
        statement += char
        if char == ';' and sqlite3.complete_statement(statement):
            if not statement.lstrip().startswith('PRAGMA foreign_keys'):
                db.execute(statement)
            statement = ''
    if statement.strip():
        # trailing comments are safe to pass to sqlite
        db.execute(statement)

def migrate(db):
    if db.in_transaction:
        raise ValueError('Migration requires an exclusive connection outside a transaction')
    db.execute('PRAGMA foreign_keys=ON')
    if db.execute('PRAGMA foreign_keys').fetchone()[0] != 1:
        raise RuntimeError('Foreign keys unavailable')
    version = db.execute('PRAGMA user_version').fetchone()[0]
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    if version == 2:
        if not V2 <= tables or tables - V2 - {'legacy_sync_queue_raw'}:
            raise RuntimeError('Incomplete v2 database')
        return
    if version not in (0,1) or (tables and tables != LEGACY):
        raise RuntimeError('Unknown database layout; no destructive migration attempted')
    db.execute('BEGIN EXCLUSIVE')
    try:
        old_rows = []
        if tables:
            columns = [r[1] for r in db.execute('PRAGMA table_info(sync_queue)')]
            for row in db.execute('SELECT rowid,* FROM sync_queue'):
                values = {}
                for key,value in zip(columns,row[1:]):
                    values[key] = {'storageType': 'blob' if isinstance(value,bytes) else 'null' if value is None else 'integer' if isinstance(value,int) else 'real' if isinstance(value,float) else 'text', 'value': value.hex().upper() if isinstance(value,bytes) else value}
                file_uri = row[1+columns.index('file_uri')] if 'file_uri' in columns else None
                old_rows.append((row[0],json.dumps(values,ensure_ascii=False),file_uri))
            db.execute('ALTER TABLE sync_queue RENAME TO legacy_sync_queue_raw')
            for name in ['local_exam_versions','local_exams','local_patients','sync_metadata']:
                db.execute(f'DROP TABLE {name}')
            db.execute('PRAGMA user_version=1')
        execute_script_transactionally(db,SCHEMA.read_text(encoding='utf-8-sig'))
        db.executemany('INSERT INTO legacy_queue_quarantine(legacy_rowid,raw_record,file_uri) VALUES(?,?,?)',old_rows)
        violations = db.execute('PRAGMA foreign_key_check').fetchall()
        if violations:
            raise RuntimeError(f'Migration FK violations: {violations}')
        db.commit()
    except BaseException:
        db.rollback()
        raise

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument('database')
    args=parser.parse_args()
    with sqlite3.connect(args.database) as connection:
        migrate(connection)
        print('SQLite schema version:',connection.execute('PRAGMA user_version').fetchone()[0])

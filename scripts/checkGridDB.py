import sqlite3
import json

conn = sqlite3.connect('prisma/dev.db')
cursor = conn.cursor()
cursor.execute("SELECT createdAt, action, message FROM EngineLog WHERE message LIKE '%GRID%' ORDER BY createdAt DESC LIMIT 20")
rows = cursor.fetchall()

if not rows:
    print("No GRID logs found.")
else:
    for r in rows:
        print(f"[{r[0]}] {r[1]}: {r[2]}")

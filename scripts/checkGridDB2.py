import sqlite3

conn = sqlite3.connect('prisma/dev.db')
c = conn.cursor()

c.execute("SELECT datetime(createdAt/1000, 'unixepoch', 'localtime'), action, result, reason FROM EngineLog ORDER BY createdAt DESC LIMIT 10")
print("Logs:")
for r in c.fetchall():
    print(r)

import sqlite3

conn = sqlite3.connect('prisma/dev.db')
c = conn.cursor()

c.execute("DELETE FROM AppSettings WHERE key='grid_v6_state'")
conn.commit()
print("Grid state completely deleted.")

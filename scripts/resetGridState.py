import sqlite3

conn = sqlite3.connect('prisma/dev.db')
c = conn.cursor()

c.execute("UPDATE AppSettings SET value = '{\"isActive\":false}' WHERE key='grid_v6_state'")
conn.commit()
print("Grid state reset to inactive.")

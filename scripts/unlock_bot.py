import sqlite3
import uuid

def update_db():
    try:
        conn = sqlite3.connect('prisma/dev.db')
        c = conn.cursor()
        
        # Create a UUID
        new_id = str(uuid.uuid4())
        
        c.execute("""
            INSERT INTO AppSettings (id, "key", "value", updatedAt) 
            VALUES (?, 'daily_profit_target_usd', '50', CURRENT_TIMESTAMP)
            ON CONFLICT("key") DO UPDATE SET "value" = '50', updatedAt = CURRENT_TIMESTAMP
        """, (new_id,))
        
        c.execute("DELETE FROM AppSettings WHERE key='circuit_breaker_lock_until'")
        c.execute("DELETE FROM AppSettings WHERE key='engine_lock'")
        
        conn.commit()
        print("Success: Daily Profit Target is now 50 USD")
        print("Success: Lock is removed")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

update_db()

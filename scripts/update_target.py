import sqlite3

def update_db():
    try:
        conn = sqlite3.connect('prisma/dev.db')
        c = conn.cursor()
        
        # Update daily_profit_target_usd to 100
        c.execute("""
            UPDATE AppSettings 
            SET "value" = '100', updatedAt = CURRENT_TIMESTAMP
            WHERE "key" = 'daily_profit_target_usd'
        """)
        
        conn.commit()
        print("Success: Daily Profit Target is now 100 USD")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

update_db()

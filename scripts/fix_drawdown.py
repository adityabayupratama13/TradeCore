import sqlite3

def fix_drawdown():
    try:
        conn = sqlite3.connect('prisma/dev.db')
        c = conn.cursor()
        
        # Unlock
        c.execute("DELETE FROM AppSettings WHERE key='circuit_breaker_lock_until'")
        c.execute("DELETE FROM AppSettings WHERE key='engine_lock'")
        
        # Set Drawdown to Unlimited (9999%)
        c.execute("""
            UPDATE RiskRule 
            SET maxDailyLossPct = 9999,
                maxWeeklyLossPct = 9999,
                maxDrawdownPct = 9999
            WHERE isActive = 1
        """)
        
        conn.commit()
        print("Success: Drawdown is now unlimited (9999%) and Bot is unlocked!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

fix_drawdown()

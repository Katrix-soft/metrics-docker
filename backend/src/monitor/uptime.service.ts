import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { MonitorService } from './monitor.service';

@Injectable()
export class UptimeService implements OnModuleInit {
  private db: sqlite3.Database;
  private readonly logger = new Logger(UptimeService.name);
  private readonly dbPath = path.join(process.cwd(), 'data', 'metrics_history.db'); // Reuse same DB file

  constructor(private monitorService: MonitorService) {}

  async onModuleInit() {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        this.logger.error('Uptime: Could not connect to database', err);
      } else {
        this.initializeTables();
      }
    });

    // Start monitoring loop every 5 minutes
    setInterval(() => this.checkAllServices(), 300000);
    
    // Initial check after 10s
    setTimeout(() => this.checkAllServices(), 10000);
  }

  private initializeTables() {
    this.db.serialize(() => {
      // Targets to monitor
      this.db.run(`
        CREATE TABLE IF NOT EXISTS uptime_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          last_status INTEGER DEFAULT 1, -- 1=Up, 0=Down
          is_active INTEGER DEFAULT 1
        )
      `);

      // Monitoring logs
      this.db.run(`
        CREATE TABLE IF NOT EXISTS uptime_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_id INTEGER,
          status INTEGER,
          response_time REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(target_id) REFERENCES uptime_targets(id)
        )
      `);

      // Seed default targets if empty
      this.db.get("SELECT count(*) as count FROM uptime_targets", (err, row: any) => {
        if (!err && row.count === 0) {
          const defaults = [
            ['Panel NexPulse', 'http://localhost:3001/api/health'],
            ['Google Connectivity', 'https://www.google.com']
          ];
          const stmt = this.db.prepare("INSERT INTO uptime_targets (name, url) VALUES (?, ?)");
          defaults.forEach(d => stmt.run(d));
          stmt.finalize();
        }
      });
    });
  }

  async checkAllServices() {
    this.db.all("SELECT * FROM uptime_targets WHERE is_active = 1", async (err, targets: any[]) => {
      if (err || !targets) return;

      for (const target of targets) {
        const start = Date.now();
        let isUp = false;
        let responseTime = 0;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
          
          const res = await fetch(target.url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          isUp = res.status >= 200 && res.status < 400;
          responseTime = Date.now() - start;
        } catch (e) {
          isUp = false;
          responseTime = Date.now() - start;
        }

        // Log to history
        this.db.run(
          "INSERT INTO uptime_logs (target_id, status, response_time) VALUES (?, ?, ?)",
          [target.id, isUp ? 1 : 0, responseTime]
        );

        // Status changed?
        if (isUp !== (target.last_status === 1)) {
          const statusStr = isUp ? '✅ UP' : '🚨 DOWN';
          const msg = `${statusStr}: El servicio "${target.name}" (${target.url}) ha cambiado su estado.\nTiempo de respuesta: ${responseTime}ms`;
          
          this.logger.warn(msg);
          this.monitorService.notifyAll(msg);

          // Update target last_status
          this.db.run("UPDATE uptime_targets SET last_status = ? WHERE id = ?", [isUp ? 1 : 0, target.id]);
        }
      }
      
      // Cleanup logs older than 30 days
      this.db.run("DELETE FROM uptime_logs WHERE timestamp < datetime('now', '-30 days')");
    });
  }

  async getUptimeSummary(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT t.*, 
          (SELECT AVG(response_time) FROM uptime_logs WHERE target_id = t.id AND timestamp > datetime('now', '-24 hours')) as avg_response,
          (SELECT COUNT(*) FROM uptime_logs WHERE target_id = t.id AND status = 0 AND timestamp > datetime('now', '-24 hours')) as downtime_incidents
        FROM uptime_targets t
        WHERE t.is_active = 1
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async addTarget(name: string, url: string) {
    return new Promise((resolve, reject) => {
      this.db.run("INSERT INTO uptime_targets (name, url) VALUES (?, ?)", [name, url], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  async removeTarget(id: number) {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM uptime_targets WHERE id = ?", [id], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }
}

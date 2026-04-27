import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class HistoryService implements OnModuleInit {
  private db: sqlite3.Database;
  private readonly logger = new Logger(HistoryService.name);
  private readonly dbPath = path.join(process.cwd(), 'data', 'metrics_history.db');

  async onModuleInit() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        this.logger.error('Could not connect to database', err);
      } else {
        this.logger.log('Connected to SQLite database');
        this.initializeTable();
      }
    });
  }

  private initializeTable() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cpu REAL,
        ram REAL,
        disk REAL
      )
    `, (err) => {
      if (err) this.logger.error('Error creating table', err);
    });
  }

  saveSnapshot(cpu: number, ram: number, disk: number) {
    this.db.run(
      'INSERT INTO metrics (cpu, ram, disk) VALUES (?, ?, ?)',
      [cpu, ram, disk],
      (err) => {
        if (err) this.logger.error('Error saving snapshot', err);
      }
    );

    // Auto-cleanup: Keep only last 7 days (approx 10,000 snapshots if 1 per minute)
    this.db.run("DELETE FROM metrics WHERE timestamp < datetime('now', '-7 days')");
  }

  async getHistory(limit = 1440): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM metrics ORDER BY timestamp ASC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getDailyAverages(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          strftime('%Y-%m-%d %H:00:00', timestamp) as time,
          AVG(cpu) as cpu,
          AVG(ram) as ram
        FROM metrics 
        GROUP BY time 
        ORDER BY time ASC 
        LIMIT 168`, // 1 week of hourly averages
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

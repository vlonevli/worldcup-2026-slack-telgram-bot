export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  FOOTBALL_DATA_API_KEY: string;
  SIMULATION_MODE: string; 
}

export interface Match {
  id: number;
  round: string;
  date: string;
  time_str: string;
  kickoff_utc: number;
  team1_name: string;
  team2_name: string;
  score_team1: number | null;
  score_team2: number | null;
  score_pen_team1: number | null;
  score_pen_team2: number | null;
  status: string;
  ground: string;
}

export interface Team {
  id: number;
  name: string;
  name_normalised: string;
  fifa_code: string;
  flag_icon: string;
  group_name: string;
  continent: string;
  confed: string;
}

export interface Subscription {
  chat_id: number;
  chat_type: string;
  chat_title: string;
  subscribed_at: number;
  is_active: number;
}

export class DBClient {
  constructor(private db: D1Database) {}

  async getMatchesToday(): Promise<Match[]> {
    const now = Date.now();
    const next24 = now + 24 * 3600 * 1000;
    const { results } = await this.db.prepare(
      `SELECT * FROM matches WHERE kickoff_utc >= ? AND kickoff_utc <= ? ORDER BY kickoff_utc ASC`
    ).bind(now - 3600000, next24).all<Match>();
    return results || [];
  }

  async getMatchById(id: number): Promise<Match | null> {
    return await this.db.prepare(`SELECT * FROM matches WHERE id = ?`).bind(id).first<Match>();
  }

  async getMatchesByGroup(group: string): Promise<Match[]> {
    const { results } = await this.db.prepare(
      `SELECT m.* FROM matches m 
       JOIN teams t1 ON m.team1_name = t1.name 
       JOIN teams t2 ON m.team2_name = t2.name 
       WHERE t1.group_name = ? OR t2.group_name = ? ORDER BY m.kickoff_utc ASC`
    ).bind(`Group ${group}`, `Group ${group}`).all<Match>();
    return results || [];
  }

  async getLiveMatches(): Promise<Match[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM matches WHERE status IN ('LIVE', 'IN_PLAY', 'PAUSED') ORDER BY kickoff_utc ASC`
    ).all<Match>();
    return results || [];
  }

  async getNextMatch(): Promise<Match | null> {
    const now = Date.now();
    const { results } = await this.db.prepare(
      `SELECT * FROM matches WHERE kickoff_utc >= ? ORDER BY kickoff_utc ASC LIMIT 1`
    ).bind(now).all<Match>();
    return results?.[0] || null;
  }

  async getAllTeams(): Promise<Team[]> {
    const { results } = await this.db.prepare(`SELECT * FROM teams ORDER BY name ASC`).all<Team>();
    return results || [];
  }

  async getStandingsByGroup(groupName: string): Promise<any[]> {
    const { results } = await this.db.prepare(
      `SELECT s.*, t.flag_icon FROM standings s JOIN teams t ON s.team_name = t.name WHERE s.group_name = ?`
    ).bind(groupName).all();
    if (results && results.length > 0) return results;
    
    const { results: teams } = await this.db.prepare(`SELECT name as team_name, flag_icon FROM teams WHERE group_name = ?`).bind(groupName).all();
    return (teams || []).map(t => ({
      team_name: t.team_name, flag_icon: t.flag_icon,
      played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0
    }));
  }

  async updateMatch(m: Match): Promise<void> {
    await this.db.prepare(
      `UPDATE matches SET score_team1 = ?, score_team2 = ?, score_pen_team1 = ?, score_pen_team2 = ?, status = ?, last_updated = ? WHERE id = ?`
    ).bind(m.score_team1, m.score_team2, m.score_pen_team1, m.score_pen_team2, m.status, Date.now(), m.id).run();
  }

  async addSubscription(chatId: number, chatType: string, chatTitle: string): Promise<void> {
    await this.db.prepare(
      `INSERT INTO subscriptions (chat_id, chat_type, chat_title, subscribed_at, is_active) 
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(chat_id) DO UPDATE SET is_active = 1, chat_title = ?`
    ).bind(chatId, chatType, chatTitle, Date.now(), chatTitle).run();
  }

  async removeSubscription(chatId: number): Promise<void> {
    await this.db.prepare(`UPDATE subscriptions SET is_active = 0 WHERE chat_id = ?`).bind(chatId).run();
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    const { results } = await this.db.prepare(`SELECT * FROM subscriptions WHERE is_active = 1`).all<Subscription>();
    return results || [];
  }

  async isNotificationSent(id: string): Promise<boolean> {
    const res = await this.db.prepare(`SELECT id FROM sent_notifications WHERE id = ?`).bind(id).first();
    return !!res;
  }

  async markNotificationSent(id: string): Promise<void> {
    await this.db.prepare(`INSERT INTO sent_notifications (id, sent_at) VALUES (?, ?) ON CONFLICT DO NOTHING`).bind(id, Date.now()).run();
  }

  async getTeamByNameOrCode(query: string): Promise<Team | null> {
    const normalised = query.trim().toLowerCase();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) {
      const sql = `SELECT * FROM teams WHERE name_normalised = ? OR fifa_code = ? LIMIT 1`;
      return await this.db.prepare(sql).bind(normalised, cleanQuery.toUpperCase()).first<Team>();
    }
    const sql = `SELECT * FROM teams WHERE name_normalised = ? OR fifa_code = ? OR name LIKE ? LIMIT 1`;
    return await this.db.prepare(sql).bind(normalised, cleanQuery.toUpperCase(), `%${cleanQuery}%`).first<Team>();
  }

  async getTeamStats(teamName: string): Promise<{ played: number; wins: number; goals: number; redCards: number }> {
    // Played finished matches
    const playedRes = await this.db.prepare(
      `SELECT COUNT(*) as count FROM matches WHERE (team1_name = ? OR team2_name = ?) AND status = 'FINISHED'`
    ).bind(teamName, teamName).first<{ count: number }>();

    // Wins
    const winsRes = await this.db.prepare(
      `SELECT COUNT(*) as count FROM matches 
       WHERE status = 'FINISHED' AND (
         (team1_name = ? AND (score_team1 > score_team2 OR (score_team1 = score_team2 AND score_pen_team1 > score_pen_team2)))
         OR 
         (team2_name = ? AND (score_team2 > score_team1 OR (score_team1 = score_team2 AND score_pen_team2 > score_pen_team1)))
       )`
    ).bind(teamName, teamName).first<{ count: number }>();

    // Goals scored
    const goals1Res = await this.db.prepare(
      `SELECT SUM(score_team1) as sum FROM matches WHERE team1_name = ? AND status = 'FINISHED'`
    ).bind(teamName).first<{ sum: number | null }>();

    const goals2Res = await this.db.prepare(
      `SELECT SUM(score_team2) as sum FROM matches WHERE team2_name = ? AND status = 'FINISHED'`
    ).bind(teamName).first<{ sum: number | null }>();

    // Red Cards
    const redCardsRes = await this.db.prepare(
      `SELECT COUNT(*) as count FROM match_events WHERE team_name = ? AND type = 'RED_CARD'`
    ).bind(teamName).first<{ count: number }>();

    return {
      played: playedRes?.count || 0,
      wins: winsRes?.count || 0,
      goals: (goals1Res?.sum || 0) + (goals2Res?.sum || 0),
      redCards: redCardsRes?.count || 0
    };
  }

  async getTeamGroupPosition(teamName: string, groupName: string): Promise<{ position: number; totalTeams: number }> {
    const standings = await this.db.prepare(
      `SELECT team_name, points, goal_difference, goals_for FROM standings 
       WHERE group_name = ? 
       ORDER BY points DESC, goal_difference DESC, goals_for DESC`
    ).bind(groupName).all();

    if (!standings.results || standings.results.length === 0) {
      // Fallback: order teams in group alphabetically or from database
      const teams = await this.db.prepare(
        `SELECT name as team_name FROM teams WHERE group_name = ? ORDER BY name ASC`
      ).bind(groupName).all();
      const idx = (teams.results || []).findIndex(r => r.team_name === teamName);
      return {
        position: idx === -1 ? 1 : idx + 1,
        totalTeams: (teams.results || []).length || 4
      };
    }

    const idx = standings.results.findIndex(r => r.team_name === teamName);
    return {
      position: idx === -1 ? 1 : idx + 1,
      totalTeams: standings.results.length
    };
  }

  async getTeamLastMatch(teamName: string): Promise<Match | null> {
    return await this.db.prepare(
      `SELECT * FROM matches 
       WHERE (team1_name = ? OR team2_name = ?) AND status = 'FINISHED' 
       ORDER BY kickoff_utc DESC LIMIT 1`
    ).bind(teamName, teamName).first<Match>();
  }

  async getTeamNextMatch(teamName: string): Promise<Match | null> {
    return await this.db.prepare(
      `SELECT * FROM matches 
       WHERE (team1_name = ? OR team2_name = ?) AND status != 'FINISHED' 
       ORDER BY kickoff_utc ASC LIMIT 1`
    ).bind(teamName, teamName).first<Match>();
  }

  async searchTeamsForInline(query: string): Promise<any[]> {
    const cleanQuery = query.trim();
    const normalised = cleanQuery.toLowerCase();
    
    let sql = `
      SELECT t.name, t.fifa_code, t.flag_icon, t.group_name,
             COALESCE(s.points, 0) as points,
             COALESCE(s.goal_difference, 0) as gd,
             COALESCE(s.goals_for, 0) as gf
      FROM teams t
      LEFT JOIN standings s ON t.name = s.team_name
      WHERE t.group_name != 'Placeholder'
    `;
    
    let results;
    if (cleanQuery.length > 0) {
      sql += `
        AND (t.name_normalised LIKE ? OR t.fifa_code LIKE ? OR t.name LIKE ?)
        ORDER BY points DESC, gd DESC, gf DESC, t.name ASC
        LIMIT 20
      `;
      const searchPattern = `%${normalised}%`;
      const codePattern = `%${cleanQuery.toUpperCase()}%`;
      const origPattern = `%${cleanQuery}%`;
      const res = await this.db.prepare(sql).bind(searchPattern, codePattern, origPattern).all();
      results = res.results;
    } else {
      sql += `
        ORDER BY points DESC, gd DESC, gf DESC, t.name ASC
        LIMIT 20
      `;
      const res = await this.db.prepare(sql).all();
      results = res.results;
    }
    
    return results || [];
  }
}

export class AIService {
  /**
   * Risk Score calculation logic:
   * riskScore = f(number_of_reports, time_of_day, severity)
   * Returns: LOW (0-3), MEDIUM (4-7), HIGH (8-10)
   */
  static calculateRiskScore(count: number, timestamp: string, category: string): { score: number, level: 'LOW' | 'MEDIUM' | 'HIGH' } {
    let score = 0;

    // 1. Density factor
    score += Math.min(count * 1.5, 4);

    // 2. Time factor (Night is between 22:00 and 05:00)
    const hour = new Date(timestamp).getHours();
    if (hour >= 22 || hour <= 5) {
      score += 3;
    } else if (hour >= 18 || hour <= 21) {
      score += 1;
    }

    // 3. Severity factor
    const severityMap: Record<string, number> = {
      'Theft': 1,
      'Harassment': 3,
      'Physical Assault': 5,
      'Suspicious Activity': 1,
      'Emergency SOS': 5,
      'Emergency / SOS': 5,
      'Poor Lighting': 1
    };
    score += severityMap[category] || 1;

    // Normalize
    const finalScore = Math.min(Math.max(score, 0), 10);
    
    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (finalScore >= 8) level = 'HIGH';
    else if (finalScore >= 4) level = 'MEDIUM';

    return { score: finalScore, level };
  }
}

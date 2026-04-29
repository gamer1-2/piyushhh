import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { mongoSim, Incident } from '../config/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { AIService } from '../services/aiService.js';

export const getIncidents = async (req: AuthRequest, res: Response) => {
  await mongoSim.read();
  res.json(mongoSim.data.reports);
};

export const getZones = async (req: AuthRequest, res: Response) => {
  await mongoSim.read();
  res.json(mongoSim.data.zones || []);
};

export const createZone = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, status } = req.body;
    await mongoSim.read();
    if (!mongoSim.data.zones) mongoSim.data.zones = [];
    mongoSim.data.zones.push({ id: uuidv4(), name, description, status });
    await mongoSim.write();
    res.status(201).json({ message: 'Zone created' });
  } catch (err) {
    res.status(500).json({ message: 'Error creating zone' });
  }
};

export const deleteZone = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await mongoSim.read();
    mongoSim.data.zones = (mongoSim.data.zones || []).filter(z => z.id !== id);
    await mongoSim.write();
    res.json({ message: 'Zone deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting zone' });
  }
};

export const createIncident = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, location, coordinates } = req.body;
    
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ message: 'Invalid coordinates provided' });
    }

    await mongoSim.read();
    if (!mongoSim.data.reports) mongoSim.data.reports = [];

    const timestamp = new Date().toISOString();
    
    // Simple AI Calculation based on nearby reports (simulated)
    const nearbyCount = (mongoSim.data.reports || []).filter(r => {
      if (!r.coordinates || typeof r.coordinates.lat !== 'number') return false;
      // Mock distance check (within 0.01 lat/lng units)
      return Math.abs(r.coordinates.lat - coordinates.lat) < 0.01 &&
             Math.abs(r.coordinates.lng - coordinates.lng) < 0.01;
    }).length;

    const { score, level } = AIService.calculateRiskScore(nearbyCount, timestamp, category);

    const newReport: Incident = {
      id: uuidv4(),
      title,
      description,
      category,
      location,
      coordinates,
      timestamp,
      userId: req.user!.id,
      userName: req.user!.name,
      riskScore: score,
      riskLevel: level,
      status: 'active',
      upvotes: 0,
      upvotedBy: [],
      comments: [],
      verified: false
    };

    mongoSim.data.reports.push(newReport);
    await mongoSim.write();

    // Broadcast new incident
    if ((req as any).io) {
      (req as any).io.emit('incident:new', newReport);
      if (newReport.riskLevel === 'HIGH') {
        (req as any).io.emit('alert:high-risk', {
          message: `HIGH RISK ALERT: ${newReport.title} reported at ${newReport.location}`,
          incident: newReport
        });
      }
    }

    res.status(201).json(newReport);
  } catch (err) {
    res.status(500).json({ message: 'Error creating incident' });
  }
};

export const upvoteIncident = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  await mongoSim.read();
  const report = mongoSim.data.reports.find(r => r.id === id);
  if (report) {
    if (!report.upvotedBy) report.upvotedBy = [];
    
    if (report.upvotedBy.includes(userId)) {
      return res.status(400).json({ message: 'You have already verified this incident' });
    }

    report.upvotes += 1;
    report.upvotedBy.push(userId);
    
    if (report.upvotes >= 5) report.verified = true;
    await mongoSim.write();
    res.json(report);
  } else {
    res.status(404).json({ message: 'Incident not found' });
  }
};

export const toggleStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await mongoSim.read();
  const report = mongoSim.data.reports.find(r => r.id === id);
  if (report) {
    report.status = report.status === 'active' ? 'closed' : 'active';
    await mongoSim.write();
    res.json(report);
  } else {
    res.status(404).json({ message: 'Incident not found' });
  }
};

export const deleteIncident = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await mongoSim.read();
  mongoSim.data.reports = mongoSim.data.reports.filter(r => r.id !== id);
  await mongoSim.write();
  res.json({ message: 'Incident deleted' });
};

export const trackLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { coordinates } = req.body;
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ message: 'Invalid tracking coordinates' });
    }

    await mongoSim.read();
    if (!mongoSim.data.live_tracking) mongoSim.data.live_tracking = [];

    const trackingData = {
      userId: req.user!.id,
      userName: req.user!.name,
      coordinates,
      timestamp: new Date().toISOString()
    };

    const index = mongoSim.data.live_tracking.findIndex(t => t.userId === req.user!.id);
    if (index !== -1) {
      mongoSim.data.live_tracking[index] = trackingData;
    } else {
      mongoSim.data.live_tracking.push(trackingData);
    }

    await mongoSim.write();

    if ((req as any).io) {
      (req as any).io.emit('location:broadcast', trackingData);
    }

    res.json({ message: 'Tracking heartbeat acknowledged' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating tracking heartbeat' });
  }
};

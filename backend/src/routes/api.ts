import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import * as incidentController from '../controllers/incidentController.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';

const router = Router();

// Auth
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/reset-password', authController.resetPassword);

// Zones
router.get('/zones', incidentController.getZones);
router.post('/zones', authenticateToken, authorizeRole(['admin']), incidentController.createZone);
router.delete('/zones/:id', authenticateToken, authorizeRole(['admin']), incidentController.deleteZone);

// Incidents
router.get('/incidents', authenticateToken, incidentController.getIncidents);
router.post('/incidents', authenticateToken, incidentController.createIncident);
router.post('/incidents/:id/upvote', authenticateToken, incidentController.upvoteIncident);
router.post('/incidents/:id/toggle-status', authenticateToken, authorizeRole(['admin']), incidentController.toggleStatus);
router.post('/tracking', authenticateToken, incidentController.trackLocation);

// Safety Zones
router.get('/safety-zones', incidentController.getZones);
router.post('/safety-zones', authenticateToken, authorizeRole(['admin']), incidentController.createZone);
router.delete('/safety-zones/:id', authenticateToken, authorizeRole(['admin']), incidentController.deleteZone);

// Admin Only
router.delete('/incidents/:id', authenticateToken, authorizeRole(['admin']), incidentController.deleteIncident);

export default router;

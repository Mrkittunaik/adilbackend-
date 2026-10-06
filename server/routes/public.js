const router = require('express').Router();
const sec = require('../middleware/security');
const pub = require('../controllers/publicController');
const t = require('../controllers/trackController');

router.get('/health', pub.health);
router.get('/public/catalog', pub.catalog);
router.get('/public/version', pub.version);
router.post('/track/visit', sec.track, t.visit);
router.post('/track/event', sec.track, t.event);
router.post('/track/cart', sec.track, t.cart);
router.post('/track/profile', sec.track, t.profile);
router.post('/track/whatsapp', sec.track, t.whatsapp);
router.post('/lead', sec.forms, t.lead);
router.post('/enquiry', sec.forms, t.enquiry);
router.post('/bulk-enquiry', sec.forms, t.bulk);
module.exports = router;

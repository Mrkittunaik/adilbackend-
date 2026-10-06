const router = require('express').Router();
const multer = require('multer');
const sec = require('../middleware/security');
const { requireAdmin } = require('../middleware/auth');
const auth = require('../controllers/authController');
const D = require('../controllers/adminData');
const C = require('../controllers/adminCatalog');
const Visitor = require('../models/Visitor'), Enquiry = require('../models/Enquiry'), Lead = require('../models/Lead');

const ALLOWED = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime))$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => ALLOWED.test(f.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Only JPG, PNG, WEBP, GIF, AVIF images and MP4/WEBM/MOV videos are allowed'), { status: 400 })) });

router.post('/login', sec.login, auth.login);
router.post('/logout', requireAdmin, auth.logout);
router.use(requireAdmin);                       // everything below needs a valid admin session
router.get('/me', auth.me);
router.get('/stats', D.stats);
router.get('/live', D.live);

router.get('/visitors', D.visitors);
router.get('/visitors/:id', D.visitor);
router.post('/visitors/:id/notes', D.addNote(Visitor));
router.get('/carts', D.carts);
router.get('/whatsapp', D.whatsappList);
router.get('/enquiries', D.enquiries);
router.patch('/enquiries/:id/status', D.setEnquiryStatus);
router.post('/enquiries/:id/notes', D.addNote(Enquiry));
router.get('/leads', D.leads);
router.patch('/leads/:id/status', D.setLeadStatus);
router.post('/leads/:id/notes', D.addNote(Lead));
router.get('/export/:type', D.exportCSV);

router.get('/products', C.listProducts);
router.post('/products', C.createProduct);
router.post('/products/demo', C.demoAction);
router.get('/products/:pid', C.getProduct);
router.put('/products/:pid', C.updateProduct);
router.patch('/products/:pid/stock', C.setStock);
router.delete('/products/:pid', C.archiveProduct);
router.post('/products/:pid/restore', C.restoreProduct);
router.post('/products/:pid/duplicate', C.duplicateProduct);
router.post('/products/:pid/media', upload.array('files', 10), C.uploadMedia);
router.delete('/products/:pid/media', C.deleteMedia);
router.put('/products/:pid/media/order', C.reorderMedia);

router.get('/categories', C.listCategories);
router.post('/categories', C.createCategory);
router.put('/categories/reorder', C.reorderCategories);
router.put('/categories/:id', C.updateCategory);
router.delete('/categories/:id', C.deleteCategory);

router.get('/settings', C.getSettings);
router.put('/settings', C.saveSettings);
module.exports = router;

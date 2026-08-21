import fs from 'fs';
import multer from 'multer';
import { NextFunction, RequestHandler } from 'express';

const addFilenameToBody = (...fieldNames: string[]) => (req: any, res: any, next: NextFunction) => {
  fieldNames.forEach(fieldName => {
    if (req.files && req.files[fieldName]) {
      let destination = req.files[fieldName][0].destination;
      if (destination.startsWith('public/')) {
        destination = destination.substring('public/'.length);
      }
      req.body[fieldName] = destination + '/' + req.files[fieldName][0].filename;
    } else if (req.file && req.file.fieldname === fieldName) {
      let destination = req.file.destination;
      if (destination.startsWith('public/')) {
        destination = destination.substring('public/'.length);
      }
      req.body[fieldName] = destination + '/' + req.file.filename;
    }
  });
  return next();
};

const handleFileUpload = (imageFieldNames: string[], folder: string): RequestHandler => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    },
    filename: function (req, file, cb) {
      cb(null, Math.random().toString(36).substring(7) + '-' + Date.now() + '.' + file.originalname.split('.').pop());
    }
  });

  if (imageFieldNames.length === 1) {
    return multer({ storage }).single(imageFieldNames[0]);
  } else {
    const fields = imageFieldNames.map(imageFieldName => { return { name: imageFieldName, maxCount: 1 }; });
    return multer({ storage }).fields(fields);
  }
};

export { handleFileUpload, addFilenameToBody };

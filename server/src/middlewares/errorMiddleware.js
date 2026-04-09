export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Clean up any uploaded file in memory/disk if there was an error in handling
  if (req.file) {
    // Memory storage clears automatically on GC, but if we stored on disk we'd remove it here.
  }
  
  res.status(statusCode).json({
    message: err.message,
    stack: isProduction ? null : err.stack,
  });
};

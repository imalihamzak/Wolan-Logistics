const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema(
  {
    hub_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true,
    },
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    related_model: {
      type: String,
      required: true,
      trim: true,
    },
    related_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
    },
    file_path: {
      type: String,
      required: true,
      trim: true,
    },
    mime_type: {
      type: String,
      required: true,
      trim: true,
    },
    file_size: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Upload', uploadSchema);

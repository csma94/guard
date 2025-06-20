const crypto = require('crypto');
const config = require('../config/config');

/**
 * Data Encryption Service for GDPR Compliance
 * Handles encryption/decryption of sensitive personal data
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    
    // Use environment variable or generate a master key
    this.masterKey = config.ENCRYPTION_KEY || this.generateKey();
  }

  /**
   * Generate a cryptographically secure random key
   */
  generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Derive encryption key from master key and salt
   */
  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext) {
    if (!plaintext) return null;
    
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key from master key and salt
      const key = this.deriveKey(salt);
      
      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(salt); // Additional authenticated data
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine salt, iv, tag, and encrypted data
      const result = {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted: encrypted
      };
      
      return JSON.stringify(result);
      
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      // Parse encrypted data
      const data = JSON.parse(encryptedData);
      const { salt, iv, tag, encrypted } = data;
      
      // Convert from hex
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');
      
      // Derive key
      const key = this.deriveKey(saltBuffer);
      
      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(saltBuffer);
      decipher.setAuthTag(tagBuffer);
      
      // Decrypt data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt personal identifiable information (PII)
   */
  encryptPII(data) {
    if (!data || typeof data !== 'object') return data;
    
    const encryptedData = { ...data };
    const piiFields = [
      'email', 'phone', 'address', 'ssn', 'nationalId', 
      'emergencyContact', 'bankAccount', 'personalDetails'
    ];
    
    piiFields.forEach(field => {
      if (encryptedData[field]) {
        encryptedData[field] = this.encrypt(
          typeof encryptedData[field] === 'object' 
            ? JSON.stringify(encryptedData[field])
            : encryptedData[field]
        );
      }
    });
    
    return encryptedData;
  }

  /**
   * Decrypt personal identifiable information (PII)
   */
  decryptPII(data) {
    if (!data || typeof data !== 'object') return data;
    
    const decryptedData = { ...data };
    const piiFields = [
      'email', 'phone', 'address', 'ssn', 'nationalId', 
      'emergencyContact', 'bankAccount', 'personalDetails'
    ];
    
    piiFields.forEach(field => {
      if (decryptedData[field]) {
        try {
          const decrypted = this.decrypt(decryptedData[field]);
          // Try to parse as JSON if it was an object
          try {
            decryptedData[field] = JSON.parse(decrypted);
          } catch {
            decryptedData[field] = decrypted;
          }
        } catch (error) {
          // If decryption fails, data might not be encrypted
          // Leave as is for backward compatibility
        }
      }
    });
    
    return decryptedData;
  }

  /**
   * Hash sensitive data for indexing (one-way)
   */
  hashForIndex(data) {
    if (!data) return null;
    
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(data, salt, 10000, 32, 'sha256');
    
    return {
      hash: hash.toString('hex'),
      salt: salt.toString('hex')
    };
  }

  /**
   * Verify hashed data
   */
  verifyHash(data, storedHash, storedSalt) {
    if (!data || !storedHash || !storedSalt) return false;
    
    try {
      const salt = Buffer.from(storedSalt, 'hex');
      const hash = crypto.pbkdf2Sync(data, salt, 10000, 32, 'sha256');
      const computedHash = hash.toString('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(storedHash, 'hex'),
        Buffer.from(computedHash, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate pseudonymized identifier
   */
  pseudonymize(identifier, context = '') {
    const data = `${identifier}:${context}`;
    const hash = crypto.createHash('sha256');
    hash.update(data);
    hash.update(this.masterKey);
    
    return hash.digest('hex').substring(0, 16); // 16 character pseudonym
  }

  /**
   * Encrypt location data with additional privacy protection
   */
  encryptLocation(latitude, longitude, accuracy = null) {
    // Add noise to coordinates for privacy (differential privacy)
    const noise = this.generateLocationNoise();
    const noisyLat = latitude + noise.lat;
    const noisyLng = longitude + noise.lng;
    
    const locationData = {
      lat: noisyLat,
      lng: noisyLng,
      accuracy,
      timestamp: Date.now()
    };
    
    return this.encrypt(JSON.stringify(locationData));
  }

  /**
   * Decrypt location data
   */
  decryptLocation(encryptedLocation) {
    try {
      const decrypted = this.decrypt(encryptedLocation);
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Location decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate location noise for differential privacy
   */
  generateLocationNoise() {
    // Laplace noise for differential privacy
    const epsilon = 0.1; // Privacy parameter
    const sensitivity = 0.001; // Sensitivity in degrees
    
    const scale = sensitivity / epsilon;
    
    return {
      lat: this.laplacianNoise(scale),
      lng: this.laplacianNoise(scale)
    };
  }

  /**
   * Generate Laplacian noise
   */
  laplacianNoise(scale) {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Secure data deletion (overwrite with random data)
   */
  secureDelete(data) {
    if (typeof data === 'string') {
      // Overwrite string with random data
      const length = data.length;
      let overwritten = '';
      for (let i = 0; i < length; i++) {
        overwritten += String.fromCharCode(Math.floor(Math.random() * 256));
      }
      return overwritten;
    }
    
    if (typeof data === 'object' && data !== null) {
      const overwritten = {};
      Object.keys(data).forEach(key => {
        overwritten[key] = this.secureDelete(data[key]);
      });
      return overwritten;
    }
    
    return null;
  }

  /**
   * Generate data retention token
   */
  generateRetentionToken(userId, dataType, retentionPeriod) {
    const tokenData = {
      userId,
      dataType,
      createdAt: Date.now(),
      expiresAt: Date.now() + retentionPeriod,
      version: 1
    };
    
    return this.encrypt(JSON.stringify(tokenData));
  }

  /**
   * Verify data retention token
   */
  verifyRetentionToken(token) {
    try {
      const decrypted = this.decrypt(token);
      const tokenData = JSON.parse(decrypted);
      
      if (Date.now() > tokenData.expiresAt) {
        return { valid: false, reason: 'Token expired' };
      }
      
      return { valid: true, data: tokenData };
    } catch (error) {
      return { valid: false, reason: 'Invalid token' };
    }
  }
}

module.exports = EncryptionService;

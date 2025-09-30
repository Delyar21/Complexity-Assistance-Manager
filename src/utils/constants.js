export const CONSTANTS = {
            CANVAS_WIDTH: 1920,
            CANVAS_HEIGHT: 1080,
            CANVAS_SIZE: 1920,
            MIN_ELEMENT_SIZE: { width: 60, height: 40 },
            ZOOM_LIMITS: { min: 0.1, max: 3 },
            THROTTLE_DELAY: 16,
            SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 Stunden
            HISTORY_SIZE: 50,
            DEFAULT_ELEMENT_SIZES: {
                rectangle: { width: 120, height: 80 },
                circle: { width: 80, height: 80 },
                diamond: { width: 80, height: 80 },
                system: { width: 120, height: 80 },
                person: { width: 80, height: 80 }
            },
            EXPORT_CONFIG: {
                VERSION: "1.1",
                FILE_PREFIX: "CAM_Project", 
                MIME_TYPE: "application/json;charset=utf-8"
            },
            STATUS_COLORS: {
                PENDING: '#6c757d',     
                ACTIVE: '#ffc107',         
                COMPLETED: '#28a745',    
                BLOCKED: '#dc3545',      
                ARCHIVED: '#e9ecef'     
            }
        };
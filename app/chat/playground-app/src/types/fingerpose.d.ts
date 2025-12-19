/**
 * Type definitions for fingerpose library
 * https://github.com/andypotato/fingerpose
 */

declare module 'fingerpose' {
  // Finger constants
  export enum Finger {
    Thumb = 0,
    Index = 1,
    Middle = 2,
    Ring = 3,
    Pinky = 4,
  }

  // Finger curl states
  export enum FingerCurl {
    NoCurl = 0,
    HalfCurl = 1,
    FullCurl = 2,
  }

  // Finger direction constants
  export enum FingerDirection {
    VerticalUp = 0,
    VerticalDown = 1,
    HorizontalLeft = 2,
    HorizontalRight = 3,
    DiagonalUpRight = 4,
    DiagonalUpLeft = 5,
    DiagonalDownRight = 6,
    DiagonalDownLeft = 7,
  }

  /**
   * Describes a hand gesture using finger positions
   */
  export class GestureDescription {
    constructor(name: string);
    
    /**
     * Add expected curl state for a finger
     * @param finger The finger index
     * @param curl The expected curl state
     * @param weight Confidence weight (0-1)
     */
    addCurl(finger: Finger, curl: FingerCurl, weight?: number): void;
    
    /**
     * Add expected direction for a finger
     * @param finger The finger index
     * @param direction The expected direction
     * @param weight Confidence weight (0-1)
     */
    addDirection(finger: Finger, direction: FingerDirection, weight?: number): void;
    
    /**
     * The name of this gesture
     */
    name: string;
  }

  /**
   * Result from gesture estimation
   */
  export interface GestureEstimatorResult {
    /** Detected gestures sorted by confidence */
    gestures: Array<{
      name: string;
      score: number;
    }>;
    /** Detected curl state per finger */
    poseData: Array<{
      curl: FingerCurl;
      direction: FingerDirection;
    }>;
  }

  /**
   * Estimates gestures from hand landmarks
   */
  export class GestureEstimator {
    /**
     * Create a new gesture estimator
     * @param knownGestures Array of gesture descriptions to detect
     */
    constructor(knownGestures: GestureDescription[]);
    
    /**
     * Estimate which gesture best matches the provided landmarks
     * @param landmarks Array of 21 hand landmarks from MediaPipe/TensorFlow
     * @param minConfidence Minimum confidence threshold (0-10)
     * @returns Estimation result with detected gestures and pose data
     */
    estimate(
      landmarks: Array<{ x: number; y: number; z: number }> | Array<[number, number, number]>,
      minConfidence: number
    ): GestureEstimatorResult;
  }
}


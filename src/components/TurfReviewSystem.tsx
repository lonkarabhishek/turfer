import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, ThumbsUp, ThumbsDown, Flag, MessageCircle, Send,
  CheckCircle, Camera, X, Filter, TrendingUp, Award
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useAuth } from '../hooks/useAuth';

interface Review {
  id: string;
  user: {
    id: string;
    name: string;
    avatar?: string;
    totalReviews: number;
    joinedDate: string;
  };
  rating: number;
  title?: string;
  comment: string;
  date: string;
  verified: boolean;
  helpful: number;
  notHelpful: number;
  images?: string[];
  visitDate?: string;
  gameType?: string;
  userVote?: 'helpful' | 'not_helpful' | null;
  response?: {
    text: string;
    date: string;
    responder: string;
  };
}

interface TurfReviewSystemProps {
  turfId: string;
  turfName: string;
  reviews: Review[];
  overallRating: number;
  totalReviews: number;
  onSubmitReview?: (review: { rating: number; title: string; comment: string; images?: File[] }) => void;
  onVoteReview?: (reviewId: string, vote: 'helpful' | 'not_helpful') => void;
  onReportReview?: (reviewId: string, reason: string) => void;
}

export function TurfReviewSystem({
  turfId,
  turfName,
  reviews,
  overallRating,
  totalReviews,
  onSubmitReview,
  onVoteReview,
  onReportReview
}: TurfReviewSystemProps) {
  const { user } = useAuth();
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful'>('newest');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [newReview, setNewReview] = useState({
    rating: 0,
    title: '',
    comment: '',
    images: [] as File[]
  });

  // Rating distribution
  const ratingDistribution = [5, 4, 3, 2, 1].map(rating => {
    const count = reviews.filter(review => review.rating === rating).length;
    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
    return { rating, count, percentage };
  });

  const sortedAndFilteredReviews = reviews
    .filter(review => filterRating ? review.rating === filterRating : true)
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'highest':
          return b.rating - a.rating;
        case 'lowest':
          return a.rating - b.rating;
        case 'helpful':
          return b.helpful - a.helpful;
        default:
          return 0;
      }
    });

  const handleSubmitReview = () => {
    if (newReview.rating === 0 || !newReview.comment.trim()) return;

    onSubmitReview?.(newReview);
    setNewReview({ rating: 0, title: '', comment: '', images: [] });
    setShowWriteReview(false);
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;

    const newImages = Array.from(files).slice(0, 5 - newReview.images.length);
    setNewReview(prev => ({
      ...prev,
      images: [...prev.images, ...newImages]
    }));
  };

  const removeImage = (index: number) => {
    setNewReview(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleVote = (reviewId: string, vote: 'helpful' | 'not_helpful') => {
    onVoteReview?.(reviewId, vote);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Reviews & Ratings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Overall Rating */}
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                <span className="text-4xl font-bold text-emerald-600">{overallRating.toFixed(1)}</span>
                <div>
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${i < Math.floor(overallRating) ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-gray-600">{totalReviews} reviews</p>
                </div>
              </div>

              {user && (
                <Button
                  onClick={() => setShowWriteReview(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 mt-4"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Write Review
                </Button>
              )}
            </div>

            {/* Rating Distribution */}
            <div className="space-y-2">
              {ratingDistribution.map(({ rating, count, percentage }) => (
                <div key={rating} className="flex items-center gap-3">
                  <button
                    onClick={() => setFilterRating(filterRating === rating ? null : rating)}
                    className={`flex items-center gap-1 text-sm min-w-[4rem] hover:text-emerald-600 transition-colors ${
                      filterRating === rating ? 'text-emerald-600 font-medium' : 'text-gray-600'
                    }`}
                  >
                    <span>{rating}</span>
                    <Star className="w-3 h-3 fill-current text-yellow-500" />
                  </button>
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 min-w-[2rem]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters and Sorting */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
            <option value="helpful">Most helpful</option>
          </select>
        </div>

        {filterRating && (
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setFilterRating(null)}
          >
            {filterRating} star reviews
            <X className="w-3 h-3 ml-1" />
          </Badge>
        )}

        <div className="text-sm text-gray-600 ml-auto">
          Showing {sortedAndFilteredReviews.length} of {totalReviews} reviews
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        <AnimatePresence>
          {sortedAndFilteredReviews.map((review) => (
            <motion.div
              key={review.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardContent className="p-6">
                  {/* Review Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <span className="text-emerald-600 font-semibold text-sm">
                          {review.user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{review.user.name}</h4>
                          {review.verified && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                          {review.user.totalReviews > 10 && (
                            <Badge variant="outline" className="text-xs">
                              <Award className="w-3 h-3 mr-1" />
                              Top Reviewer
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < review.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                              />
                            ))}
                          </div>
                          <span>•</span>
                          <span>{formatDate(review.date)}</span>
                          {review.visitDate && (
                            <>
                              <span>•</span>
                              <span>Visited {formatDate(review.visitDate)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReportReview?.(review.id, 'inappropriate')}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Flag className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Review Content */}
                  <div className="space-y-3">
                    {review.title && (
                      <h5 className="font-medium text-gray-900">{review.title}</h5>
                    )}

                    <p className="text-gray-700 leading-relaxed">{review.comment}</p>

                    {/* Review Images */}
                    {review.images && review.images.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {review.images.map((image, index) => (
                          <img
                            key={index}
                            src={image}
                            alt={`Review image ${index + 1}`}
                            className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          />
                        ))}
                      </div>
                    )}

                    {/* Game Type Tag */}
                    {review.gameType && (
                      <Badge variant="outline" className="text-xs">
                        {review.gameType}
                      </Badge>
                    )}
                  </div>

                  {/* Owner Response */}
                  {review.response && (
                    <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-200 rounded">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-blue-900">
                          Response from {review.response.responder}
                        </span>
                        <span className="text-xs text-blue-600">
                          {formatDate(review.response.date)}
                        </span>
                      </div>
                      <p className="text-sm text-blue-800">{review.response.text}</p>
                    </div>
                  )}

                  {/* Review Actions */}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleVote(review.id, 'helpful')}
                      className={`flex items-center gap-1 text-sm transition-colors ${
                        review.userVote === 'helpful'
                          ? 'text-emerald-600'
                          : 'text-gray-500 hover:text-emerald-600'
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                      Helpful ({review.helpful})
                    </button>

                    <button
                      onClick={() => handleVote(review.id, 'not_helpful')}
                      className={`flex items-center gap-1 text-sm transition-colors ${
                        review.userVote === 'not_helpful'
                          ? 'text-red-600'
                          : 'text-gray-500 hover:text-red-600'
                      }`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                      Not helpful ({review.notHelpful})
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {sortedAndFilteredReviews.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No reviews found matching your criteria</p>
            {filterRating && (
              <Button
                variant="outline"
                onClick={() => setFilterRating(null)}
                className="mt-2"
              >
                Clear filter
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Write Review Modal */}
      <AnimatePresence>
        {showWriteReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Write a Review</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWriteReview(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Rating */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Overall Rating</label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          onClick={() => setNewReview(prev => ({ ...prev, rating }))}
                          className="p-1"
                        >
                          <Star
                            className={`w-6 h-6 transition-colors ${
                              rating <= newReview.rating
                                ? 'text-yellow-500 fill-current'
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Title (optional)</label>
                    <input
                      type="text"
                      value={newReview.title}
                      onChange={(e) => setNewReview(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Summarize your experience"
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Comment */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Review</label>
                    <textarea
                      value={newReview.comment}
                      onChange={(e) => setNewReview(prev => ({ ...prev, comment: e.target.value }))}
                      placeholder="Share your experience at this turf..."
                      rows={4}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Add Photos (optional)</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleImageUpload(e.target.files)}
                        className="hidden"
                        id="review-images"
                      />
                      <label
                        htmlFor="review-images"
                        className="flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <Camera className="w-8 h-8 text-gray-400" />
                        <span className="text-sm text-gray-600">Click to add photos</span>
                      </label>

                      {newReview.images.length > 0 && (
                        <div className="flex gap-2 mt-3">
                          {newReview.images.map((image, index) => (
                            <div key={index} className="relative">
                              <img
                                src={URL.createObjectURL(image)}
                                alt={`Preview ${index + 1}`}
                                className="w-16 h-16 object-cover rounded-lg"
                              />
                              <button
                                onClick={() => removeImage(index)}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowWriteReview(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitReview}
                      disabled={newReview.rating === 0 || !newReview.comment.trim()}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Submit Review
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
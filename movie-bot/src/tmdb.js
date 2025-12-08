const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Film qidirish
async function searchMovies(query) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: query,
        language: 'en-US',
        page: 1
      }
    });
    return response.data.results;
  } catch (error) {
    console.error('❌ TMDb qidiruv xatosi:', error.message);
    return [];
  }
}

// Film tafsilotlari
async function getMovieDetails(movieId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'en-US'
      }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Film tafsilotlari xatosi:', error.message);
    return null;
  }
}

// Mashhur filmlar
async function getTrending() {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/week`, {
      params: {
        api_key: TMDB_API_KEY
      }
    });
    return response.data.results;
  } catch (error) {
    console.error('❌ Trending filmlar xatosi:', error.message);
    return [];
  }
}

// Trailer olish
async function getTrailer(movieId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}/videos`, {
      params: {
        api_key: TMDB_API_KEY
      }
    });
    
    const trailer = response.data.results.find(
      video => video.type === 'Trailer' && video.site === 'YouTube'
    );
    
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
  } catch (error) {
    console.error('❌ Trailer xatosi:', error.message);
    return null;
  }
}

// Janr bo'yicha filmlar
async function getMoviesByGenre(genreId) {
  try {
    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: genreId,
        sort_by: 'popularity.desc',
        language: 'en-US'
      }
    });
    return response.data.results;
  } catch (error) {
    console.error('❌ Janr bo\'yicha filmlar xatosi:', error.message);
    return [];
  }
}

// Film ma'lumotlarini formatlash
function formatMovieInfo(movie) {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
    overview: movie.overview || 'Tavsif mavjud emas',
    poster: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
    genres: movie.genres ? movie.genres.map(g => g.name).join(', ') : 'N/A'
  };
}

module.exports = {
  searchMovies,
  getMovieDetails,
  getTrending,
  getTrailer,
  getMoviesByGenre,
  formatMovieInfo
};

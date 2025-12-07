const axios = require("axios");

const TMDB_API_KEY = process.env.TMDB_KEY;

async function searchMovie(query) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
  const res = await axios.get(url);
  return res.data.results;
}

async function getMovie(id) {
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

module.exports = {
  searchMovie,
  getMovie
};

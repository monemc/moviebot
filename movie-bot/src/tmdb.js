const https = require('https');

class TMDB {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.themoviedb.org/3';
        this.imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
    }
    
    async searchMovie(query) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=uz-UZ`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        resolve(result.results || []);
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }
    
    async getMovieDetails(movieId) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}&language=uz-UZ`;
            
            https.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }
    
    getImageUrl(path) {
        return path ? `${this.imageBaseUrl}${path}` : null;
    }
    
    formatMovieInfo(movie) {
        return {
            title: movie.title || movie.original_title,
            year: movie.release_date?.split('-')[0] || 'N/A',
            rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
            description: movie.overview || 'Ma\'lumot yo\'q',
            poster: this.getImageUrl(movie.poster_path),
            genres: movie.genres?.map(g => g.name).join(', ') || 'N/A'
        };
    }
}

module.exports = TMDB;
